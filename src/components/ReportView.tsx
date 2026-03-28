import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, LoaderCircle, Search, X } from 'lucide-react';
import { YEARS } from '../constants';
import { ConsolidatedData, DataFileRecordSummary, DataRow, FormTemplate, HeaderLayout, ManagedUnit, Project, UserProfile } from '../types';
import { getPreferredReportingYear } from '../utils/reportingYear';
import { uploadFile } from '../supabase';
import {
  loadTemplateWorkbook,
  resolveTemplateEffectiveEndRowFromWorksheet,
  resolveTemplateHeaderLayout,
  resolveTemplateRowLabels,
} from '../utils/templateWorkbook';
import { fetchAggregatedRowsFromSupabase, fetchCellDetailsFromSupabase } from '../supabaseReports';
import { createReportExport, getDataFileRecord } from '../supabaseStore';

interface ReportViewProps {
  data: ConsolidatedData;
  dataFiles: DataFileRecordSummary[];
  projects: Project[];
  templates: FormTemplate[];
  units: ManagedUnit[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  currentUser: UserProfile | null;
}

interface CellDetailItem {
  unitCode: string;
  unitName: string;
  value: number;
}

interface TemplateRowDefinition {
  sourceRow: number;
  label: string;
}

interface AggregatedReportRow {
  key: string;
  sourceRow: number;
  label: string;
  values: number[];
  details: CellDetailItem[][];
}

interface ActiveCellDetail {
  sourceRow: number;
  columnIndex: number;
  rowLabel: string;
  columnLabel: string;
  totalValue: number;
  items: CellDetailItem[];
}

interface DataFileRecord {
  downloadURL?: string;
}

type DetailSortOrder = 'desc' | 'asc';

const TOTAL_REPORT_UNIT_CODE = '__TOTAL_CITY__';

function sanitizeFileNamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatReportValue(value: number) {
  return value === 0 ? '' : value.toLocaleString('vi-VN');
}

async function fetchStoredDataFile(projectId: string, unitCode: string, year: string) {
  if (!projectId || !unitCode || !year) {
    return null;
  }

  const record = await getDataFileRecord(projectId, unitCode, year);
  if (!record) {
    return null;
  }

  return {
    downloadURL: record.download_url || undefined,
  } as DataFileRecord;
}

function buildHeaderRows(layout: HeaderLayout) {
  const rowCount = layout.endRow - layout.startRow + 1;
  const colCount = layout.endCol - layout.startCol + 1;

  if (rowCount <= 0 || colCount <= 0) {
    return null;
  }

  const cellMap = new Map(layout.cells.map((cell) => [`${cell.row}:${cell.col}`, cell.value]));
  const mergeMap = new Map((layout.merges || []).map((merge) => [`${merge.startRow}:${merge.startCol}`, merge]));
  const occupied = Array.from({ length: rowCount }, () => Array(colCount).fill(false));
  const rows: { text: string; rowSpan: number; colSpan: number; startColOffset: number }[][] = [];

  for (let r = 0; r < rowCount; r += 1) {
    const rowCells: { text: string; rowSpan: number; colSpan: number; startColOffset: number }[] = [];

    for (let c = 0; c < colCount; c += 1) {
      if (occupied[r][c]) {
        continue;
      }

      const rowNum = layout.startRow + r;
      const colNum = layout.startCol + c;
      const merge = mergeMap.get(`${rowNum}:${colNum}`);
      const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
      const colSpan = merge ? merge.endCol - merge.startCol + 1 : 1;

      for (let rr = r; rr < r + rowSpan; rr += 1) {
        for (let cc = c; cc < c + colSpan; cc += 1) {
          if (occupied[rr] && typeof occupied[rr][cc] !== 'undefined') {
            occupied[rr][cc] = true;
          }
        }
      }

      rowCells.push({
        text: cellMap.get(`${rowNum}:${colNum}`) || '',
        rowSpan,
        colSpan,
        startColOffset: c,
      });
    }

    rows.push(rowCells);
  }

  return rows;
}

function buildTemplateRowDefinitions(
  template: FormTemplate,
  templateRows: TemplateRowDefinition[],
  labelsBySourceRow: Map<number, string>,
  extraSourceRows: number[] = [],
) {
  const sourceRows = new Set<number>(extraSourceRows);

  if (templateRows.length > 0) {
    templateRows.forEach((row) => sourceRows.add(row.sourceRow));
  } else {
    Array.from(
      { length: template.columnMapping.endRow - template.columnMapping.startRow + 1 },
      (_, index) => template.columnMapping.startRow + index,
    ).forEach((sourceRow) => sourceRows.add(sourceRow));
  }

  return Array.from(sourceRows)
    .sort((left, right) => left - right)
    .map((sourceRow) => ({
      sourceRow,
      label:
        labelsBySourceRow.get(sourceRow) ||
        templateRows.find((row) => row.sourceRow === sourceRow)?.label ||
        `Dòng ${sourceRow}`,
    }));
}

function shouldDisplayReportRow(row: AggregatedReportRow, normalizedSearchTerm: string) {
  const hasMeaningfulLabel = row.label.trim() !== '' && !/^Dòng\s+\d+$/i.test(row.label.trim());
  const hasData = row.details.some((items) => items.length > 0);
  const matchesSearch = normalizedSearchTerm === '' || row.label.toLowerCase().includes(normalizedSearchTerm);

  return matchesSearch && (hasMeaningfulLabel || hasData);
}

function estimateReportColumnWidth(columnIndex: number, headerText: string, totalColumns: number) {
  if (columnIndex === 0) {
    return 250;
  }

  const normalizedLength = headerText.trim().length;
  const compactBase = totalColumns >= 8 ? 106 : 118;
  const dynamicWidth = compactBase + Math.min(normalizedLength * 1.6, totalColumns >= 8 ? 24 : 38);

  return Math.max(compactBase, Math.min(dynamicWidth, totalColumns >= 8 ? 142 : 168));
}

function buildValueMapForTemplate(
  data: ConsolidatedData,
  template: FormTemplate,
  year: string,
  selectedUnitCode: string,
) {
  const rows = (data[template.id] || []).filter((row) => row.year === year);
  const relevantRows =
    selectedUnitCode === TOTAL_REPORT_UNIT_CODE
      ? rows
      : rows.filter((row) => row.unitCode === selectedUnitCode);
  const rowMap = new Map<number, number[]>();

  relevantRows.forEach((row) => {
    const currentValues = rowMap.get(row.sourceRow) || new Array(template.columnMapping.dataColumns.length).fill(0);
    row.values.forEach((value, index) => {
      currentValues[index] += value;
    });
    rowMap.set(row.sourceRow, currentValues);
  });

  return rowMap;
}

function buildFlatWorksheetForTemplate(
  data: ConsolidatedData,
  template: FormTemplate,
  year: string,
  selectedUnitCode: string,
) {
  const rows = (data[template.id] || []).filter((row) => row.year === year);
  const relevantRows =
    selectedUnitCode === TOTAL_REPORT_UNIT_CODE
      ? rows
      : rows.filter((row) => row.unitCode === selectedUnitCode);
  const rowMap = new Map<number, DataRow[]>();

  relevantRows.forEach((row) => {
    const existing = rowMap.get(row.sourceRow) || [];
    existing.push(row);
    rowMap.set(row.sourceRow, existing);
  });

  const exportRows = Array.from(rowMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([sourceRow, sourceRows]) => {
      const values = new Array(template.columnMapping.dataColumns.length).fill(0);
      sourceRows.forEach((row) => {
        row.values.forEach((value, index) => {
          values[index] += value;
        });
      });

      const rowData: Record<string, string | number> = {
        'Tiêu chí': sourceRows[0]?.label || `Dòng ${sourceRow}`,
      };
      values.forEach((value, index) => {
        rowData[template.columnHeaders[index] || `Cột ${index + 1}`] = value === 0 ? '' : value;
      });

      return rowData;
    });

  return XLSX.utils.json_to_sheet(exportRows);
}

function populateTemplateWorksheet(
  worksheet: XLSX.WorkSheet,
  template: FormTemplate,
  data: ConsolidatedData,
  year: string,
  selectedUnitCode: string,
) {
  const valueMap = buildValueMapForTemplate(data, template, year, selectedUnitCode);
  const { startRow, dataColumns } = template.columnMapping;
  const endRow = resolveTemplateEffectiveEndRowFromWorksheet(worksheet, template);

  for (let sourceRow = startRow; sourceRow <= endRow; sourceRow += 1) {
    const currentRowValues = valueMap.get(sourceRow);

    dataColumns.forEach((columnLetter, index) => {
      const address = `${columnLetter}${sourceRow}`;
      const currentCell = worksheet[address] || {};
      const value = currentRowValues?.[index] ?? 0;

      if (value === 0) {
        worksheet[address] = {
          ...currentCell,
          t: 's',
          v: '',
          w: '',
        };
        return;
      }

      worksheet[address] = {
        ...currentCell,
        t: 'n',
        v: value,
        w: String(value),
      };
    });
  }
}

export function ReportView({ data, dataFiles, projects, templates, units, selectedProjectId, onSelectProject, currentUser }: ReportViewProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [selectedUnitCode, setSelectedUnitCode] = useState(TOTAL_REPORT_UNIT_CODE);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCellDetail, setActiveCellDetail] = useState<ActiveCellDetail | null>(null);
  const [detailSortOrder, setDetailSortOrder] = useState<DetailSortOrder>('desc');
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [resolvedHeaderLayout, setResolvedHeaderLayout] = useState<HeaderLayout | null>(null);
  const [templateRows, setTemplateRows] = useState<TemplateRowDefinition[]>([]);
  const [visibleRowCount, setVisibleRowCount] = useState(40);
  const [supabaseAggregatedRows, setSupabaseAggregatedRows] = useState<AggregatedReportRow[]>([]);
  const [isSupabaseLoadingRows, setIsSupabaseLoadingRows] = useState(false);

  const unitNameByCode = useMemo(
    () => new Map(units.map((unit) => [unit.code, unit.name])),
    [units],
  );
  const projectTemplates = templates.filter((tpl) => tpl.projectId === selectedProjectId);
  const selectedTemplate = projectTemplates.find((tpl) => tpl.id === selectedTemplateId) || null;
  const reportUnitOptions = useMemo(() => {
    const importedUnitCodes = new Set<string>();

    dataFiles
      .filter((file) => file.projectId === selectedProjectId && file.year === selectedYear)
      .forEach((file) => {
        if (file.unitCode) {
          importedUnitCodes.add(file.unitCode);
        }
      });

    projectTemplates.forEach((template) => {
      (data[template.id] || [])
        .filter((row) => row.year === selectedYear && row.projectId === selectedProjectId)
        .forEach((row) => {
          if (row.unitCode) {
            importedUnitCodes.add(row.unitCode);
          }
        });
    });

    const importedUnits = Array.from(importedUnitCodes)
      .map((unitCode) => {
        const matchedUnit = units.find((unit) => unit.code === unitCode);
        if (matchedUnit) {
          return matchedUnit;
        }

        const matchedFile = dataFiles.find(
          (file) => file.projectId === selectedProjectId && file.year === selectedYear && file.unitCode === unitCode,
        );

        return {
          code: unitCode,
          name: matchedFile?.unitName || unitCode,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'vi'));

    return [{ code: TOTAL_REPORT_UNIT_CODE, name: 'Đảng bộ Thành phố' }, ...importedUnits];
  }, [data, dataFiles, projectTemplates, selectedProjectId, selectedYear, units]);
  const selectedUnitOption =
    reportUnitOptions.find((unit) => unit.code === selectedUnitCode) || reportUnitOptions[0];

  const columnHeaders = useMemo(() => {
    if (!selectedTemplate) return [];
    if (Array.isArray(selectedTemplate.columnHeaders) && selectedTemplate.columnHeaders.length > 0) {
      return selectedTemplate.columnHeaders;
    }

    const fallbackCount = selectedTemplate.columnMapping?.dataColumns?.length || 0;
    return Array.from({ length: fallbackCount }, (_, index) => `Cột ${index + 1}`);
  }, [selectedTemplate]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  useEffect(() => {
    if (projectTemplates.length > 0 && !projectTemplates.find((tpl) => tpl.id === selectedTemplateId)) {
      setSelectedTemplateId(projectTemplates[0].id);
    }
  }, [projectTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!reportUnitOptions.find((unit) => unit.code === selectedUnitCode)) {
      setSelectedUnitCode(TOTAL_REPORT_UNIT_CODE);
    }
  }, [reportUnitOptions, selectedUnitCode]);

  useEffect(() => {
    let isCancelled = false;

    if (!selectedTemplate) {
      setResolvedHeaderLayout(null);
      setTemplateRows([]);
      return undefined;
    }

    Promise.all([resolveTemplateHeaderLayout(selectedTemplate), resolveTemplateRowLabels(selectedTemplate)])
      .then(([nextHeaderLayout, nextTemplateRows]) => {
        if (isCancelled) {
          return;
        }

        setResolvedHeaderLayout(nextHeaderLayout);
        setTemplateRows(nextTemplateRows);
      })
      .catch((error) => {
        console.error('Không thể tải cấu trúc biểu mẫu báo cáo:', error);
        if (!isCancelled) {
          setResolvedHeaderLayout(selectedTemplate.headerLayout || null);
          setTemplateRows([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate) {
      setSupabaseAggregatedRows([]);
      return undefined;
    }

    let isCancelled = false;
    setIsSupabaseLoadingRows(true);

    fetchAggregatedRowsFromSupabase(selectedProjectId, selectedTemplate.id, selectedYear, selectedUnitCode)
      .then((rows) => {
        if (isCancelled) return;

        const columnCount = selectedTemplate.columnMapping.dataColumns.length;
        const labelsBySourceRow = new Map<number, string>();

        templateRows.forEach((row) => {
          labelsBySourceRow.set(row.sourceRow, row.label);
        });

        rows.forEach((row) => {
          if (!labelsBySourceRow.has(row.source_row) && row.label) {
            labelsBySourceRow.set(row.source_row, row.label);
          }
        });

        const rowDefinitions = buildTemplateRowDefinitions(
          selectedTemplate,
          templateRows,
          labelsBySourceRow,
          rows.map((row) => row.source_row),
        );
        const aggregated: AggregatedReportRow[] = rowDefinitions
          .map((definition) => {
            const entry = rows.find((row) => row.source_row === definition.sourceRow);
            return {
              key: `${selectedUnitCode}:${definition.sourceRow}`,
              sourceRow: definition.sourceRow,
              label: labelsBySourceRow.get(definition.sourceRow) || definition.label || `Dòng ${definition.sourceRow}`,
              values: entry?.values || new Array(columnCount).fill(0),
              details: Array.from({ length: columnCount }, () => []),
            };
          })
          .filter((row) => shouldDisplayReportRow(row, normalizedSearchTerm))
          .sort((left, right) => left.sourceRow - right.sourceRow);

        if (!isCancelled) {
          setSupabaseAggregatedRows(aggregated);
        }
      })
      .catch((error) => {
        console.error('Fetch Supabase aggregated rows error:', error);
        if (!isCancelled) {
          setSupabaseAggregatedRows([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsSupabaseLoadingRows(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    normalizedSearchTerm,
    selectedProjectId,
    selectedTemplateId,
    selectedYear,
    selectedUnitCode,
    selectedTemplate,
    templateRows,
  ]);

  useEffect(() => {
    setVisibleRowCount(40);
  }, [selectedTemplateId, selectedYear, selectedUnitCode, searchTerm]);

  useEffect(() => {
    setActiveCellDetail(null);
    setDetailLoadError(null);
    setIsDetailLoading(false);
  }, [selectedProjectId, selectedTemplateId, selectedYear, selectedUnitCode, searchTerm]);

  const sortedDetailItems = useMemo(() => {
    if (!activeCellDetail) {
      return [];
    }

    return [...activeCellDetail.items].sort((left, right) => {
      if (left.value === right.value) {
        return left.unitName.localeCompare(right.unitName, 'vi');
      }

      return detailSortOrder === 'desc' ? right.value - left.value : left.value - right.value;
    });
  }, [activeCellDetail, detailSortOrder]);

  const localAggregatedRows = useMemo<AggregatedReportRow[]>(() => {
    if (!selectedTemplate) {
      return [];
    }

    const dataColumnCount = selectedTemplate.columnMapping.dataColumns.length;
    const allYearRows = (data[selectedTemplate.id] || []).filter((row) => row.year === selectedYear);
    const relevantRows =
      selectedUnitCode === TOTAL_REPORT_UNIT_CODE
        ? allYearRows
        : allYearRows.filter((row) => row.unitCode === selectedUnitCode);

    const rowsBySourceRow = new Map<number, typeof relevantRows>();
    relevantRows.forEach((row) => {
      const existingRows = rowsBySourceRow.get(row.sourceRow) || [];
      existingRows.push(row);
      rowsBySourceRow.set(row.sourceRow, existingRows);
    });

    const labelsBySourceRow = new Map<number, string>();
    templateRows.forEach((row) => {
      labelsBySourceRow.set(row.sourceRow, row.label);
    });
    allYearRows.forEach((row) => {
      if (!labelsBySourceRow.has(row.sourceRow) && row.label) {
        labelsBySourceRow.set(row.sourceRow, row.label);
      }
    });

    const rowDefinitions = buildTemplateRowDefinitions(
      selectedTemplate,
      templateRows,
      labelsBySourceRow,
      Array.from(rowsBySourceRow.keys()),
    );

    return rowDefinitions
      .map((definition) => {
        const rowEntries = rowsBySourceRow.get(definition.sourceRow) || [];
        const values = new Array(dataColumnCount).fill(0);
        const detailMaps = Array.from({ length: dataColumnCount }, () => new Map<string, CellDetailItem>());
        const label = labelsBySourceRow.get(definition.sourceRow) || definition.label || `Dòng ${definition.sourceRow}`;

        rowEntries.forEach((row) => {
          const unitName = units.find((unit) => unit.code === row.unitCode)?.name || row.unitCode;

          row.values.forEach((value, index) => {
            values[index] += value;

            const existingItem = detailMaps[index].get(row.unitCode);
            if (existingItem) {
              existingItem.value += value;
              return;
            }

            detailMaps[index].set(row.unitCode, {
              unitCode: row.unitCode,
              unitName,
              value,
            });
          });
        });

        return {
          key: `${selectedUnitCode}:${definition.sourceRow}`,
          sourceRow: definition.sourceRow,
          label,
          values,
          details: detailMaps.map((detailMap) => Array.from(detailMap.values())),
        };
      })
      .filter((row) => shouldDisplayReportRow(row, normalizedSearchTerm))
      .sort((left, right) => left.sourceRow - right.sourceRow);
  }, [data, searchTerm, selectedTemplate, selectedUnitCode, selectedYear, templateRows, units]);

  const headerRows = useMemo(() => {
    if (!resolvedHeaderLayout) {
      return null;
    }

    return buildHeaderRows(resolvedHeaderLayout);
  }, [resolvedHeaderLayout]);

  const aggregatedRows = supabaseAggregatedRows.length > 0 ? supabaseAggregatedRows : localAggregatedRows;

  const tableColSpan = useMemo(() => {
    if (!selectedTemplate) {
      return 0;
    }

    if (resolvedHeaderLayout && headerRows) {
      return resolvedHeaderLayout.endCol - resolvedHeaderLayout.startCol + 1;
    }

    return 1 + columnHeaders.length;
  }, [columnHeaders.length, headerRows, resolvedHeaderLayout, selectedTemplate]);

  const tableColumnWidths = useMemo(() => {
    if (tableColSpan <= 0) {
      return [];
    }

    return Array.from({ length: tableColSpan }, (_, index) => {
      if (index === 0) {
        return estimateReportColumnWidth(index, 'Tiêu chí', tableColSpan);
      }

      return estimateReportColumnWidth(index, columnHeaders[index - 1] || `Cột ${index}`, tableColSpan);
    });
  }, [columnHeaders, tableColSpan]);

  const buildWorkbookForTemplates = async (templatesToExport: FormTemplate[]) => {
    let workbook: XLSX.WorkBook | null = null;
    let usedTemplateWorkbook = false;

    try {
      const templateWorkbook = XLSX.utils.book_new();

      for (const template of templatesToExport) {
        try {
          const sourceWorkbook = await loadTemplateWorkbook(template);
          const worksheet = sourceWorkbook.Sheets[template.sheetName];

          if (worksheet) {
            populateTemplateWorksheet(worksheet, template, data, selectedYear, selectedUnitCode);
            XLSX.utils.book_append_sheet(
              templateWorkbook,
              worksheet,
              template.sheetName.slice(0, 31) || template.name.slice(0, 31) || 'BaoCao',
            );
            usedTemplateWorkbook = true;
            continue;
          }
        } catch (error) {
          console.error(`Không thể đọc workbook mẫu của biểu ${template.name}:`, error);
        }

        const fallbackWorksheet = buildFlatWorksheetForTemplate(data, template, selectedYear, selectedUnitCode);
        XLSX.utils.book_append_sheet(
          templateWorkbook,
          fallbackWorksheet,
          template.sheetName.slice(0, 31) || template.name.slice(0, 31) || 'BaoCao',
        );
      }

      workbook = templateWorkbook.SheetNames.length > 0 ? templateWorkbook : null;
    } catch (error) {
      console.error('Template export error:', error);
    }

    if (!workbook) {
      const fallbackWorkbook = XLSX.utils.book_new();
      templatesToExport.forEach((template) => {
        const fallbackWorksheet = buildFlatWorksheetForTemplate(data, template, selectedYear, selectedUnitCode);
        XLSX.utils.book_append_sheet(
          fallbackWorkbook,
          fallbackWorksheet,
          template.sheetName.slice(0, 31) || template.name.slice(0, 31) || 'BaoCao',
        );
      });
      workbook = fallbackWorkbook;
    }

    return { workbook, usedTemplateWorkbook };
  };

  const persistExportRecord = async (
    workbook: XLSX.WorkBook,
    fileName: string,
    templateId: string,
    templateName: string,
  ) => {
    try {
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const uploadResult = await uploadFile(blob, {
        folder: `report_exports/${selectedProjectId}`,
        fileName: `${templateId}_${selectedUnitOption.code}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await createReportExport({
        project_id: selectedProjectId,
        template_id: templateId,
        template_name: templateName,
        unit_code: selectedUnitOption.code,
        unit_name: selectedUnitOption.name,
        year: selectedYear,
        file_name: fileName,
        storage_path: uploadResult.path,
        download_url: uploadResult.publicUrl,
        created_by: currentUser
          ? {
              uid: currentUser.id,
              email: currentUser.email,
              displayName: currentUser.displayName,
            }
          : null,
      });
    } catch (error) {
      console.error('Export upload error:', error);
      alert('Xuất file thành công nhưng chưa lưu được báo cáo trên Supabase Storage. Vui lòng kiểm tra đăng nhập hoặc quyền bucket uploads.');
    }
  };

  const exportToExcel = async () => {
    if (!selectedTemplate || aggregatedRows.length === 0) {
      return;
    }

    const storedRecord = await fetchStoredDataFile(selectedProjectId, selectedUnitOption.code, selectedYear);
    if (storedRecord?.downloadURL) {
      window.open(storedRecord.downloadURL, '_blank');
      return;
    }

    const fileName = [
      'BaoCao',
      sanitizeFileNamePart(selectedTemplate.name),
      sanitizeFileNamePart(selectedUnitOption.name),
      sanitizeFileNamePart(selectedYear),
    ]
      .filter(Boolean)
      .join('_')
      .concat('.xlsx');

    const { workbook, usedTemplateWorkbook } = await buildWorkbookForTemplates([selectedTemplate]);
    if (!usedTemplateWorkbook) {
      alert('Không đọc được workbook mẫu cho biểu này. Hệ thống sẽ xuất theo bảng tổng hợp hiện tại.');
    }

    XLSX.writeFile(workbook, fileName);
    await persistExportRecord(workbook, fileName, selectedTemplate.id, selectedTemplate.name);
  };

  const exportAllTemplates = async () => {
    if (projectTemplates.length === 0) {
      return;
    }

    const fileName = [
      'BaoCao',
      sanitizeFileNamePart(projects.find((project) => project.id === selectedProjectId)?.name || 'DuAn'),
      sanitizeFileNamePart(selectedUnitOption.name),
      sanitizeFileNamePart(selectedYear),
      'TatCaBieu',
    ]
      .filter(Boolean)
      .join('_')
      .concat('.xlsx');

    const { workbook, usedTemplateWorkbook } = await buildWorkbookForTemplates(projectTemplates);
    if (!usedTemplateWorkbook) {
      alert('Không đọc được workbook mẫu của dự án. Hệ thống sẽ xuất toàn bộ biểu theo bảng tổng hợp đơn giản.');
    }

    XLSX.writeFile(workbook, fileName);
    await persistExportRecord(workbook, fileName, 'ALL', 'Tất cả biểu');
  };

  const openCellDetail = async (row: AggregatedReportRow, columnIndex: number) => {
    setDetailSortOrder('desc');
    setDetailLoadError(null);
    setIsDetailLoading(true);
    setActiveCellDetail({
      sourceRow: row.sourceRow,
      columnIndex,
      rowLabel: row.label,
      columnLabel: columnHeaders[columnIndex] || `Cột ${columnIndex + 1}`,
      totalValue: row.values[columnIndex] || 0,
      items: row.details[columnIndex] || [],
    });

    if (!selectedTemplate) {
      setIsDetailLoading(false);
      return;
    }

    try {
      const detailRows = await fetchCellDetailsFromSupabase(
        selectedProjectId,
        selectedTemplate.id,
        selectedYear,
        row.sourceRow,
        columnIndex,
        selectedUnitCode,
      );

      setActiveCellDetail((current) => {
        if (!current || current.sourceRow !== row.sourceRow || current.columnIndex !== columnIndex) {
          return current;
        }

        return {
          ...current,
          items: detailRows.map((item) => ({
            unitCode: item.unit_code,
            unitName: item.unit_name || unitNameByCode.get(item.unit_code) || item.unit_code,
            value: item.value,
          })),
        };
      });
    } catch (error) {
      console.error('Không thể tải chi tiết ô dữ liệu từ Supabase:', error);
      setDetailLoadError(error instanceof Error ? error.message : 'Không thể tải chi tiết ô dữ liệu.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="page-title">Báo cáo tổng hợp</h2>
          <p className="page-subtitle mt-2 text-sm">Truy xuất dữ liệu theo đúng biểu mẫu, dự án, năm và đơn vị.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={exportAllTemplates}
            disabled={projectTemplates.length === 0}
            className="secondary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={16} />
            Xuất toàn bộ biểu
          </button>
          <button
            onClick={exportToExcel}
            disabled={!selectedTemplate || aggregatedRows.length === 0}
            className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={16} />
            Xuất biểu đang chọn
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header mb-2 block">1. Chọn dự án</label>
          <select
            value={selectedProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="field-select text-sm font-bold"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header mb-2 block">2. Chọn năm</label>
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="field-select text-sm font-bold"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header mb-2 block">3. Chọn đơn vị</label>
          <select
            value={selectedUnitCode}
            onChange={(event) => setSelectedUnitCode(event.target.value)}
            className="field-select text-sm font-bold"
          >
            {reportUnitOptions.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.name}
              </option>
            ))}
          </select>
        </div>

        <div className="panel-card rounded-[20px] p-4">
          <label className="col-header mb-2 block">4. Tìm kiếm tiêu chí</label>
          <div className="flex items-center gap-2 border-b border-[var(--line-strong)] py-2">
            <Search size={16} className="text-[var(--ink-soft)]" />
            <input
              type="text"
              placeholder="Tên tiêu chí..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full bg-transparent text-sm font-medium focus:outline-none"
            />
          </div>
        </div>
      </div>

      {projectTemplates.length > 0 && (
        <div className="mb-6 overflow-x-auto pb-2">
          <div className="flex w-max gap-3 pl-1">
            {projectTemplates.map((template) => {
              const isActive = selectedTemplateId === template.id;

              return (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`h-11 min-w-[120px] rounded-[14px] border px-4 text-[12px] font-bold uppercase tracking-[0.04em] transition-colors ${
                    isActive
                      ? 'border-[rgba(67,122,87,0.35)] bg-[rgba(232,241,233,1)] text-[var(--success)]'
                      : 'border-[rgba(214,171,96,0.45)] bg-[rgba(255,249,236,1)] text-[rgba(145,94,15,0.95)] hover:bg-[rgba(252,240,215,1)]'
                  }`}
                >
                  <span className="whitespace-nowrap">{template.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!selectedTemplate ? (
        <div className="panel-card rounded-[24px] p-10 text-center opacity-60">
          Chưa chọn biểu mẫu. Vui lòng chọn dự án và biểu mẫu để hiển thị báo cáo.
        </div>
      ) : (
        <div className="table-shell overflow-hidden rounded-[24px] border border-[var(--line-strong)] bg-white">
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-separate border-spacing-0 table-auto bg-white">
              <colgroup>
                {tableColumnWidths.map((width, index) => (
                  <col key={`report-col-${index}`} style={{ width: `${width}px`, minWidth: `${width}px` }} />
                ))}
              </colgroup>
              <thead>
                {headerRows ? (
                  headerRows.map((row, rowIndex) => (
                    <tr key={`hdr-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <th
                          key={`hdr-${rowIndex}-${cellIndex}`}
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                          className={`border-b border-r border-[var(--line-strong)] bg-[#faf8f4] px-2.5 py-2 text-center align-middle text-[13px] leading-[1.35] text-[var(--ink)] [overflow-wrap:anywhere] ${
                            rowIndex === 0 ? 'border-t' : ''
                          } ${
                            cell.startColOffset === 0
                              ? 'sticky left-0 z-10 bg-[#f8f6f1] text-[14px] font-bold'
                              : 'font-semibold'
                          }`}
                        >
                          {cell.text || '\u00A0'}
                        </th>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <th className="sticky left-0 top-0 z-10 border-b border-r border-t border-[var(--line-strong)] bg-[#f8f6f1] px-3 py-2 text-[14px] font-bold leading-[1.35] text-[var(--ink)] [overflow-wrap:anywhere]">
                      Tiêu chí
                    </th>
                    {columnHeaders.map((header, index) => (
                      <th
                        key={header || index}
                        className="border-b border-r border-t border-[var(--line-strong)] bg-[#faf8f4] px-2.5 py-2 text-center text-[13px] font-semibold leading-[1.35] text-[var(--ink)] [overflow-wrap:anywhere]"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {aggregatedRows.length > 0 ? (
                  aggregatedRows.slice(0, visibleRowCount).map((row) => (
                    <tr key={row.key} className="bg-white hover:bg-[#faf7f2]">
                      <td className="sticky left-0 z-10 border-b border-r border-[var(--line)] bg-white px-3 py-1.5 text-[13px] font-semibold leading-[1.45] text-[var(--ink)] [overflow-wrap:anywhere]">
                        {row.label}
                      </td>
                      {row.values.map((value, index) => (
                        <td key={`${row.key}-${index}`} className="border-b border-r border-[var(--line)] p-0">
                          <button
                            type="button"
                            onClick={() => openCellDetail(row, index)}
                            className="h-full min-h-[42px] w-full px-2 py-1.5 text-center text-[13px] font-medium leading-[1.35] text-[var(--ink)] transition-colors hover:bg-[var(--primary-soft)]"
                            title="Xem chi tiết theo đơn vị"
                          >
                            {formatReportValue(value)}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableColSpan} className="p-12 text-center italic opacity-40">
                      Không tìm thấy dữ liệu cho tiêu chí này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {visibleRowCount < aggregatedRows.length && (
            <div className="flex items-center justify-center gap-2 border-t border-[var(--line)] p-4">
              <span className="text-xs text-[var(--ink-soft)]">
                Đang hiển thị {Math.min(visibleRowCount, aggregatedRows.length)} / {aggregatedRows.length} dòng
              </span>
              <button
                type="button"
                onClick={() => setVisibleRowCount((prev) => Math.min(prev + 40, aggregatedRows.length))}
                className="secondary-btn text-xs"
              >
                Tải thêm
              </button>
            </div>
          )}
        </div>
      )}

      {activeCellDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,62,80,0.45)] p-4 backdrop-blur-sm md:p-8">
          <div className="panel-card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5">
              <div>
                <div className="surface-tag">{activeCellDetail.columnLabel}</div>
                <h3 className="section-title mt-3">Chi tiết đơn vị theo ô dữ liệu</h3>
                <p className="page-subtitle mt-2 text-sm">{activeCellDetail.rowLabel}</p>
                <p className="mt-3 text-sm font-semibold text-[var(--primary-dark)]">
                  Tổng cộng: {activeCellDetail.totalValue.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="panel-soft rounded-full px-3 py-2">
                  <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                    Sắp xếp giá trị
                  </label>
                  <select
                    value={detailSortOrder}
                    onChange={(event) => setDetailSortOrder(event.target.value as DetailSortOrder)}
                    className="mt-1 w-full bg-transparent text-xs font-semibold text-[var(--ink)] focus:outline-none"
                  >
                    <option value="desc">Giảm dần</option>
                    <option value="asc">Tăng dần</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCellDetail(null)}
                  className="secondary-btn flex items-center gap-2"
                >
                  <X size={16} />
                  Đóng
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
              {isDetailLoading ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-[var(--ink-soft)]">
                  <LoaderCircle size={22} className="animate-spin text-[var(--brand)]" />
                  <span>Đang tải chi tiết đơn vị...</span>
                </div>
              ) : detailLoadError ? (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--danger)]">
                  {detailLoadError}
                </div>
              ) : sortedDetailItems.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {sortedDetailItems.map((item) => (
                    <div
                      key={`${item.unitCode}-${item.unitName}`}
                      className="grid gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 md:grid-cols-[minmax(0,1fr)_140px] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.unitName}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          {item.unitCode}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="col-header mb-1">Giá trị</p>
                        <p className="data-value text-lg font-bold text-[var(--primary-dark)]">
                          {item.value.toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] p-8 text-center text-sm text-[var(--ink-soft)]">
                  Không có đơn vị nào đóng góp dữ liệu cho ô này.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
