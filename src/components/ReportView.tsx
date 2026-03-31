
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, LoaderCircle, Search, X } from 'lucide-react';
import { YEARS } from '../constants';
import {
  ConsolidatedData,
  DataFileRecordSummary,
  DataRow,
  FormTemplate,
  HeaderLayout,
  ManagedUnit,
  Project,
  UserProfile,
} from '../types';
import { getPreferredReportingYear } from '../utils/reportingYear';
import { uploadFile } from '../supabase';
import { createReportExport } from '../supabaseStore';
import { fetchAggregatedRowsFromSupabase, fetchCellDetailsFromSupabase } from '../supabaseReports';
import {
  loadTemplateWorkbook,
  resolveTemplateEffectiveEndRowFromWorksheet,
  resolveTemplateHeaderLayout,
  resolveTemplateRowLabels,
} from '../utils/templateWorkbook';

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
  isSpecial?: boolean;
}

interface AggregatedReportRow {
  key: string;
  sourceRow: number;
  label: string;
  isSpecial?: boolean;
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

const TOTAL_REPORT_UNIT_CODE = '__TOTAL_CITY__';
const INITIAL_VISIBLE_ROWS = 40;
const VISIBLE_ROW_STEP = 40;

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

function buildHeaderRows(layout: HeaderLayout) {
  const rowCount = layout.endRow - layout.startRow + 1;
  const colCount = layout.endCol - layout.startCol + 1;

  if (rowCount <= 0 || colCount <= 0) {
    return null;
  }

  const cellMap = new Map(layout.cells.map((cell) => [`${cell.row}:${cell.col}`, cell.value]));
  const mergeMap = new Map((layout.merges || []).map((merge) => [`${merge.startRow}:${merge.startCol}`, merge]));
  const occupied = Array.from({ length: rowCount }, () => Array(colCount).fill(false));
  const rows: { text: string; rowSpan: number; colSpan: number }[][] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowCells: { text: string; rowSpan: number; colSpan: number }[] = [];

    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      if (occupied[rowIndex][colIndex]) {
        continue;
      }

      const rowNumber = layout.startRow + rowIndex;
      const colNumber = layout.startCol + colIndex;
      const merge = mergeMap.get(`${rowNumber}:${colNumber}`);
      const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1;
      const colSpan = merge ? merge.endCol - merge.startCol + 1 : 1;

      for (let rr = rowIndex; rr < rowIndex + rowSpan; rr += 1) {
        for (let cc = colIndex; cc < colIndex + colSpan; cc += 1) {
          if (occupied[rr] && typeof occupied[rr][cc] !== 'undefined') {
            occupied[rr][cc] = true;
          }
        }
      }

      rowCells.push({
        text: cellMap.get(`${rowNumber}:${colNumber}`) || '',
        rowSpan,
        colSpan,
      });
    }

    rows.push(rowCells);
  }

  return rows;
}

function estimateReportColumnWidth(columnIndex: number, headerText: string, totalColumns: number) {
  if (columnIndex === 0) {
    return 260;
  }

  const normalizedLength = headerText.trim().length;
  const compactBase = totalColumns >= 8 ? 108 : 122;
  const dynamicWidth = compactBase + Math.min(normalizedLength * 1.5, totalColumns >= 8 ? 24 : 40);

  return Math.max(compactBase, Math.min(dynamicWidth, totalColumns >= 8 ? 148 : 176));
}

function createRowDefinitions(
  template: FormTemplate,
  labelsBySourceRow: Map<number, string>,
  extraSourceRows: number[] = [],
) {
  const sourceRows = new Set<number>(extraSourceRows);
  const specialRows = new Set(template.columnMapping.specialRows || []);

  if (sourceRows.size === 0) {
    for (let sourceRow = template.columnMapping.startRow; sourceRow <= template.columnMapping.endRow; sourceRow += 1) {
      sourceRows.add(sourceRow);
    }
  }

  return Array.from(sourceRows)
    .sort((left, right) => left - right)
    .map((sourceRow) => ({
      sourceRow,
      label: labelsBySourceRow.get(sourceRow) || `Dòng ${sourceRow}`,
      isSpecial: specialRows.has(sourceRow),
    })) as TemplateRowDefinition[];
}

function buildRowLabelsMap(template: FormTemplate, templateRows: TemplateRowDefinition[], rows: DataRow[]) {
  const labelsBySourceRow = new Map<number, string>();

  templateRows.forEach((row) => {
    if (row.label) {
      labelsBySourceRow.set(row.sourceRow, row.label);
    }
  });

  rows.forEach((row) => {
    if (!labelsBySourceRow.has(row.sourceRow) && row.label) {
      labelsBySourceRow.set(row.sourceRow, row.label);
    }
  });

  for (let sourceRow = template.columnMapping.startRow; sourceRow <= template.columnMapping.endRow; sourceRow += 1) {
    if (!labelsBySourceRow.has(sourceRow)) {
      labelsBySourceRow.set(sourceRow, `Dòng ${sourceRow}`);
    }
  }

  return labelsBySourceRow;
}

function aggregateRowsLocally(
  template: FormTemplate,
  rows: DataRow[],
  selectedUnitCode: string,
  templateRows: TemplateRowDefinition[],
) {
  const specialRows = new Set(template.columnMapping.specialRows || []);
  const filteredRows = rows.filter((row) => row.templateId === template.id);
  const relevantRows =
    selectedUnitCode === TOTAL_REPORT_UNIT_CODE
      ? filteredRows.filter((row) => !specialRows.has(row.sourceRow))
      : filteredRows.filter((row) => row.unitCode === selectedUnitCode && !specialRows.has(row.sourceRow));

  const rowsBySourceRow = new Map<number, DataRow[]>();
  relevantRows.forEach((row) => {
    const bucket = rowsBySourceRow.get(row.sourceRow) || [];
    bucket.push(row);
    rowsBySourceRow.set(row.sourceRow, bucket);
  });

  const labelsBySourceRow = buildRowLabelsMap(template, templateRows, filteredRows);
  const rowDefinitions = createRowDefinitions(template, labelsBySourceRow, Array.from(rowsBySourceRow.keys()));

  return rowDefinitions.map((definition) => {
    const sourceRows = rowsBySourceRow.get(definition.sourceRow) || [];
    const values = new Array(template.columnMapping.dataColumns.length).fill(0);
    const details = new Array(template.columnMapping.dataColumns.length).fill(null).map(() => [] as CellDetailItem[]);

    sourceRows.forEach((row) => {
      row.values.forEach((value, index) => {
        values[index] += Number(value) || 0;
        details[index].push({
          unitCode: row.unitCode,
          unitName: row.unitCode,
          value: Number(value) || 0,
        });
      });
    });

    return {
      key: `${definition.sourceRow}`,
      sourceRow: definition.sourceRow,
      label: definition.label,
      isSpecial: definition.isSpecial,
      values,
      details,
    } satisfies AggregatedReportRow;
  });
}

function setWorksheetCellValue(worksheet: XLSX.WorkSheet, address: string, value: number) {
  const existingCell = worksheet[address] || {};
  const nextCell = { ...existingCell } as XLSX.CellObject & { f?: string; w?: string };
  delete nextCell.f;

  if (value === 0) {
    nextCell.t = 's';
    nextCell.v = '';
    nextCell.w = '';
  } else {
    nextCell.t = 'n';
    nextCell.v = value;
    nextCell.w = value.toString();
  }

  worksheet[address] = nextCell;
}

function populateTemplateWorksheet(
  worksheet: XLSX.WorkSheet,
  template: FormTemplate,
  data: ConsolidatedData,
  year: string,
  selectedUnitCode: string,
) {
  const rows = (data[template.id] || []).filter((row) => row.year === year);
  const specialRows = new Set(template.columnMapping.specialRows || []);
  const relevantRows =
    selectedUnitCode === TOTAL_REPORT_UNIT_CODE
      ? rows.filter((row) => !specialRows.has(row.sourceRow))
      : rows.filter((row) => row.unitCode === selectedUnitCode && !specialRows.has(row.sourceRow));

  const valueMap = new Map<number, number[]>();
  relevantRows.forEach((row) => {
    const currentValues = valueMap.get(row.sourceRow) || new Array(template.columnMapping.dataColumns.length).fill(0);
    row.values.forEach((value, index) => {
      currentValues[index] += Number(value) || 0;
    });
    valueMap.set(row.sourceRow, currentValues);
  });

  const effectiveEndRow = resolveTemplateEffectiveEndRowFromWorksheet(worksheet, template);
  for (let sourceRow = template.columnMapping.startRow; sourceRow <= effectiveEndRow; sourceRow += 1) {
    const rowValues = valueMap.get(sourceRow) || new Array(template.columnMapping.dataColumns.length).fill(0);
    template.columnMapping.dataColumns.forEach((columnLetter, columnIndex) => {
      const address = `${columnLetter}${sourceRow}`;
      setWorksheetCellValue(worksheet, address, rowValues[columnIndex] || 0);
    });
  }
}

function buildFlatWorksheetForTemplate(
  data: ConsolidatedData,
  template: FormTemplate,
  year: string,
  selectedUnitCode: string,
  templateRows: TemplateRowDefinition[] = [],
) {
  const rows = (data[template.id] || []).filter((row) => row.year === year);
  const aggregatedRows = aggregateRowsLocally(template, rows, selectedUnitCode, templateRows);
  const columnHeaders =
    template.columnHeaders.length > 0
      ? template.columnHeaders
      : Array.from({ length: template.columnMapping.dataColumns.length }, (_, index) => `Cột ${index + 1}`);

  const exportRows = aggregatedRows.map((row) => {
    const rowData: Record<string, string | number> = {
      'Tiêu chí': row.label,
    };

    row.values.forEach((value, index) => {
      rowData[columnHeaders[index] || `Cột ${index + 1}`] = value === 0 ? '' : value;
    });

    return rowData;
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const columns = [{ wch: 42 }, ...columnHeaders.map((header) => ({ wch: Math.max(12, header.length + 2) }))];
  worksheet['!cols'] = columns;
  return worksheet;
}

function uniqueSheetName(baseName: string, usedNames: Set<string>) {
  const trimmed = (baseName || 'Sheet').slice(0, 31);
  if (!usedNames.has(trimmed)) {
    usedNames.add(trimmed);
    return trimmed;
  }

  let index = 2;
  while (index < 1000) {
    const suffix = `_${index}`;
    const candidate = `${trimmed.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    index += 1;
  }

  return trimmed;
}

export function ReportView({
  data,
  dataFiles,
  projects,
  templates,
  units,
  selectedProjectId,
  onSelectProject,
  currentUser,
}: ReportViewProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedYear, setSelectedYear] = useState(() => getPreferredReportingYear());
  const [selectedUnitCode, setSelectedUnitCode] = useState(TOTAL_REPORT_UNIT_CODE);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCellDetail, setActiveCellDetail] = useState<ActiveCellDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [resolvedHeaderLayout, setResolvedHeaderLayout] = useState<HeaderLayout | null>(null);
  const [templateRows, setTemplateRows] = useState<TemplateRowDefinition[]>([]);
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_VISIBLE_ROWS);
  const [supabaseAggregatedRows, setSupabaseAggregatedRows] = useState<AggregatedReportRow[]>([]);
  const [isSupabaseLoadingRows, setIsSupabaseLoadingRows] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const projectTemplates = useMemo(
    () => templates.filter((template) => template.projectId === selectedProjectId),
    [templates, selectedProjectId],
  );
  const selectedTemplate = projectTemplates.find((template) => template.id === selectedTemplateId) || null;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const headerRows = useMemo(
    () => (resolvedHeaderLayout ? buildHeaderRows(resolvedHeaderLayout) : null),
    [resolvedHeaderLayout],
  );

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
        .filter((row) => row.projectId === selectedProjectId && row.year === selectedYear)
        .forEach((row) => importedUnitCodes.add(row.unitCode));
    });

    const importedUnits = units
      .filter((unit) => !unit.isDeleted && importedUnitCodes.has(unit.code))
      .map((unit) => ({ code: unit.code, name: unit.name }));

    return [{ code: TOTAL_REPORT_UNIT_CODE, name: 'Đảng bộ Thành phố' }, ...importedUnits];
  }, [data, dataFiles, projectTemplates, selectedProjectId, selectedYear, units]);

  const selectedUnitOption = reportUnitOptions.find((unit) => unit.code === selectedUnitCode) || reportUnitOptions[0] || null;

  const columnHeaders = useMemo(() => {
    if (!selectedTemplate) {
      return [] as string[];
    }

    if (selectedTemplate.columnHeaders.length > 0) {
      return selectedTemplate.columnHeaders;
    }

    return Array.from({ length: selectedTemplate.columnMapping.dataColumns.length }, (_, index) => `Cột ${index + 1}`);
  }, [selectedTemplate]);

  useEffect(() => {
    if (projectTemplates.length === 0) {
      setSelectedTemplateId('');
      return;
    }

    if (!projectTemplates.find((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(projectTemplates[0].id);
    }
  }, [projectTemplates, selectedTemplateId]);

  useEffect(() => {
    if (reportUnitOptions.length === 0) {
      setSelectedUnitCode(TOTAL_REPORT_UNIT_CODE);
      return;
    }

    if (!reportUnitOptions.find((unit) => unit.code === selectedUnitCode)) {
      setSelectedUnitCode(reportUnitOptions[0].code);
    }
  }, [reportUnitOptions, selectedUnitCode]);

  useEffect(() => {
    setVisibleRowCount(INITIAL_VISIBLE_ROWS);
  }, [selectedProjectId, selectedTemplateId, selectedYear, selectedUnitCode, searchTerm]);

  useEffect(() => {
    if (!selectedTemplate) {
      setResolvedHeaderLayout(null);
      setTemplateRows([]);
      return;
    }

    let cancelled = false;

    Promise.all([
      resolveTemplateHeaderLayout(selectedTemplate).catch(() => selectedTemplate.headerLayout || null),
      resolveTemplateRowLabels(selectedTemplate).catch(() => []),
    ])
      .then(([headerLayout, rows]) => {
        if (cancelled) {
          return;
        }

        setResolvedHeaderLayout(headerLayout || selectedTemplate.headerLayout || null);
        setTemplateRows(rows.map((row) => ({ sourceRow: row.sourceRow, label: row.label })));
      })
      .catch((error) => {
        console.error('Không thể tải cấu trúc biểu mẫu báo cáo:', error);
        if (!cancelled) {
          setResolvedHeaderLayout(selectedTemplate.headerLayout || null);
          setTemplateRows([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate || !selectedProjectId) {
      setSupabaseAggregatedRows([]);
      return;
    }

    let cancelled = false;
    setIsSupabaseLoadingRows(true);

    fetchAggregatedRowsFromSupabase(selectedProjectId, selectedTemplate.id, selectedYear, selectedUnitCode)
      .then((rows) => {
        if (cancelled) {
          return;
        }

        const labelsBySourceRow = buildRowLabelsMap(selectedTemplate, templateRows, data[selectedTemplate.id] || []);
        const rowDefinitions = createRowDefinitions(
          selectedTemplate,
          labelsBySourceRow,
          rows.map((row) => row.source_row),
        );
        const rowValueMap = new Map(rows.map((row) => [row.source_row, row]));

        setSupabaseAggregatedRows(
          rowDefinitions.map((definition) => {
            const sourceRow = rowValueMap.get(definition.sourceRow);
            return {
              key: `${selectedTemplate.id}_${definition.sourceRow}`,
              sourceRow: definition.sourceRow,
              label: definition.label,
              isSpecial: definition.isSpecial,
              values: sourceRow?.values || new Array(selectedTemplate.columnMapping.dataColumns.length).fill(0),
              details: new Array(selectedTemplate.columnMapping.dataColumns.length).fill(null).map(() => [] as CellDetailItem[]),
            } satisfies AggregatedReportRow;
          }),
        );
      })
      .catch((error) => {
        console.error('Không thể tải dữ liệu báo cáo từ Supabase, chuyển sang tổng hợp cục bộ:', error);
        if (!cancelled) {
          setSupabaseAggregatedRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSupabaseLoadingRows(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data, selectedProjectId, selectedTemplate, selectedUnitCode, selectedYear, templateRows]);

  const aggregatedRows = useMemo(() => {
    if (!selectedTemplate) {
      return [] as AggregatedReportRow[];
    }

    const sourceRows =
      supabaseAggregatedRows.length > 0
        ? supabaseAggregatedRows
        : aggregateRowsLocally(selectedTemplate, data[selectedTemplate.id] || [], selectedUnitCode, templateRows);

    return sourceRows.filter((row) => {
      if (normalizedSearchTerm === '') {
        return true;
      }
      return row.label.toLowerCase().includes(normalizedSearchTerm);
    });
  }, [data, normalizedSearchTerm, selectedTemplate, selectedUnitCode, supabaseAggregatedRows, templateRows]);

  const visibleRows = aggregatedRows.slice(0, visibleRowCount);
  const hasMoreRows = visibleRowCount < aggregatedRows.length;

  const persistExportRecord = async (
    workbook: XLSX.WorkBook,
    fileName: string,
    templateId: string,
    templateName: string,
  ) => {
    const workbookBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([workbookBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const uploadResult = await uploadFile(blob, {
      folder: `report_exports/${selectedProjectId}`,
      fileName,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await createReportExport({
      project_id: selectedProjectId,
      template_id: templateId,
      template_name: templateName,
      unit_code: selectedUnitCode,
      unit_name: selectedUnitOption?.name || selectedUnitCode,
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
  };

  const buildWorkbookForTemplates = async (
    templatesToExport: FormTemplate[],
    options?: { requireTemplateWorkbook?: boolean },
  ) => {
    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();
    let usedTemplateWorkbook = false;
    const missingTemplateWorkbooks: string[] = [];

    for (const template of templatesToExport) {
      const fallbackTemplateRows =
        template.id === selectedTemplate?.id
          ? templateRows
          : (await resolveTemplateRowLabels(template).catch(() => [])).map((row) => ({
              sourceRow: row.sourceRow,
              label: row.label,
            }));

      try {
        const hasTemplateWorkbook = Boolean(template.sourceWorkbookUrl?.trim() || template.sourceWorkbookPath?.trim());
        if (options?.requireTemplateWorkbook && !hasTemplateWorkbook) {
          missingTemplateWorkbooks.push(template.name);
          continue;
        }

        if (hasTemplateWorkbook) {
          const sourceWorkbook = await loadTemplateWorkbook(template);
          const sourceWorksheet = sourceWorkbook.Sheets[template.sheetName];

          if (sourceWorksheet) {
            populateTemplateWorksheet(sourceWorksheet, template, data, selectedYear, selectedUnitCode);
            XLSX.utils.book_append_sheet(
              workbook,
              sourceWorksheet,
              uniqueSheetName(template.sheetName || template.name, usedSheetNames),
            );
            usedTemplateWorkbook = true;
            continue;
          }
        }
      } catch (error) {
        if (options?.requireTemplateWorkbook) {
          missingTemplateWorkbooks.push(template.name);
          continue;
        }
        console.error('Không thể đọc workbook mẫu cho biểu báo cáo:', error);
      }

      const fallbackWorksheet = buildFlatWorksheetForTemplate(data, template, selectedYear, selectedUnitCode, fallbackTemplateRows);
      XLSX.utils.book_append_sheet(
        workbook,
        fallbackWorksheet,
        uniqueSheetName(template.sheetName || template.name, usedSheetNames),
      );
    }

    return { workbook, usedTemplateWorkbook, missingTemplateWorkbooks };
  };

  const exportAllTemplates = async () => {
    if (projectTemplates.length === 0 || !selectedUnitOption) {
      return;
    }

    setIsExporting(true);
    try {
      const fileName = [
        'BaoCao',
        sanitizeFileNamePart(selectedProject?.name || 'DuAn'),
        sanitizeFileNamePart(selectedUnitOption.name),
        sanitizeFileNamePart(selectedYear),
        'TatCaBieu',
      ]
        .filter(Boolean)
        .join('_')
        .concat('.xlsx');

      const shouldRequireTemplateWorkbook = selectedUnitCode === TOTAL_REPORT_UNIT_CODE;
      const { workbook, usedTemplateWorkbook, missingTemplateWorkbooks } = await buildWorkbookForTemplates(projectTemplates, {
        requireTemplateWorkbook: shouldRequireTemplateWorkbook,
      });

      if (shouldRequireTemplateWorkbook && missingTemplateWorkbooks.length > 0) {
        alert(
          `Không thể xuất cho lựa chọn "Đảng bộ Thành phố" vì các biểu sau chưa có file mẫu gốc hoặc không đọc được workbook mẫu: ${missingTemplateWorkbooks.join(', ')}.`,
        );
        return;
      }

      if (!usedTemplateWorkbook) {
        alert('Không đọc được workbook mẫu của dự án. Hệ thống sẽ xuất toàn bộ biểu theo bảng tổng hợp đơn giản.');
      }

      XLSX.writeFile(workbook, fileName);
      await persistExportRecord(workbook, fileName, 'ALL', 'Tất cả biểu');
    } catch (error) {
      console.error('Xuất toàn bộ biểu thất bại:', error);
      alert(error instanceof Error ? error.message : 'Không thể xuất toàn bộ biểu.');
    } finally {
      setIsExporting(false);
    }
  };

  const openCellDetail = async (row: AggregatedReportRow, columnIndex: number) => {
    setIsDetailLoading(true);
    setDetailLoadError(null);
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
      const details = await fetchCellDetailsFromSupabase(
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
          items: details.map((item) => ({
            unitCode: item.unit_code,
            unitName: item.unit_name,
            value: item.value,
          })),
        };
      });
    } catch (error) {
      console.error('Không thể tải chi tiết ô dữ liệu:', error);
      setDetailLoadError(error instanceof Error ? error.message : 'Không thể tải chi tiết ô dữ liệu.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-tight text-[#8B0000] md:text-5xl">
            Báo cáo tổng hợp
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
            Truy xuất dữ liệu đã tổng hợp theo dự án, biểu mẫu và đơn vị. Khi chọn Đảng bộ Thành phố,
            hệ thống sẽ ưu tiên dùng đúng file mẫu đã tải lên lúc tạo biểu mẫu để ghi số liệu tổng hợp 132 đơn vị.
          </p>
        </div>

        <button
          type="button"
          onClick={exportAllTemplates}
          disabled={isExporting || projectTemplates.length === 0}
          className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#b43434] px-6 py-4 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#8B0000] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Xuất toàn bộ biểu
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <label className="rounded-[28px] border border-[#d8c6b6] bg-white px-5 py-5 shadow-[0_10px_35px_rgba(139,0,0,0.08)]">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B0000]">1. Chọn dự án</span>
          <select
            value={selectedProjectId}
            onChange={(event) => onSelectProject(event.target.value)}
            className="mt-3 w-full border-0 border-b border-[#d8c6b6] bg-transparent px-0 pb-3 text-lg font-medium text-slate-800 outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-[28px] border border-[#d8c6b6] bg-white px-5 py-5 shadow-[0_10px_35px_rgba(139,0,0,0.08)]">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B0000]">2. Chọn năm</span>
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="mt-3 w-full border-0 border-b border-[#d8c6b6] bg-transparent px-0 pb-3 text-lg font-medium text-slate-800 outline-none"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-[28px] border border-[#d8c6b6] bg-white px-5 py-5 shadow-[0_10px_35px_rgba(139,0,0,0.08)]">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B0000]">3. Chọn đơn vị</span>
          <select
            value={selectedUnitCode}
            onChange={(event) => setSelectedUnitCode(event.target.value)}
            className="mt-3 w-full border-0 border-b border-[#d8c6b6] bg-transparent px-0 pb-3 text-lg font-medium text-slate-800 outline-none"
          >
            {reportUnitOptions.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[30px] border border-[#d8c6b6] bg-white p-5 shadow-[0_10px_35px_rgba(139,0,0,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {projectTemplates.map((template) => {
                const isActive = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? 'border-[#8B0000] bg-[#8B0000] text-white'
                        : 'border-[#d8c6b6] bg-[#fff8f3] text-[#8B0000] hover:border-[#8B0000]'
                    }`}
                  >
                    {template.name}
                  </button>
                );
              })}
            </div>

            <label className="flex w-full items-center gap-3 rounded-2xl border border-[#d8c6b6] bg-[#fffaf6] px-4 py-3 lg:max-w-[320px]">
              <Search className="h-4 w-4 text-[#8B0000]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm kiếm chỉ tiêu..."
                className="w-full bg-transparent text-sm text-slate-700 outline-none"
              />
            </label>
          </div>

          <div className="mt-5 overflow-auto rounded-[24px] border border-[#d8c6b6]">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[#8B0000] text-white">
                {headerRows && headerRows.length > 0 ? (
                  <>
                    {headerRows.map((row, rowIndex) => (
                      <tr key={`header-${rowIndex}`}>
                        <th
                          rowSpan={headerRows.length}
                          className="min-w-[260px] border border-[#c86b6b] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]"
                        >
                          Chỉ tiêu dọc
                        </th>
                        {row.map((cell, cellIndex) => (
                          <th
                            key={`header-cell-${rowIndex}-${cellIndex}`}
                            rowSpan={cell.rowSpan}
                            colSpan={cell.colSpan}
                            className="border border-[#c86b6b] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em]"
                          >
                            {cell.text}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </>
                ) : (
                  <tr>
                    <th className="min-w-[260px] border border-[#c86b6b] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">
                      Chỉ tiêu dọc
                    </th>
                    {columnHeaders.map((header, index) => (
                      <th
                        key={header}
                        style={{ minWidth: `${estimateReportColumnWidth(index + 1, header, columnHeaders.length)}px` }}
                        className="border border-[#c86b6b] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em]"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>

              <tbody>
                {isSupabaseLoadingRows ? (
                  <tr>
                    <td colSpan={Math.max(2, columnHeaders.length + 1)} className="px-4 py-10 text-center text-slate-500">
                      <div className="inline-flex items-center gap-3">
                        <LoaderCircle className="h-5 w-5 animate-spin text-[#8B0000]" />
                        Đang tải dữ liệu báo cáo...
                      </div>
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(2, columnHeaders.length + 1)} className="px-4 py-10 text-center text-slate-500">
                      Không có dữ liệu phù hợp.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr key={row.key} className="odd:bg-white even:bg-[#fffaf6]">
                      <td className="border border-[#ead8ca] px-4 py-3 text-[15px] font-semibold text-slate-800">
                        {row.label}
                      </td>
                      {row.values.map((value, columnIndex) => (
                        <td key={`${row.key}-${columnIndex}`} className="border border-[#ead8ca] px-3 py-3 text-center text-slate-700">
                          <button
                            type="button"
                            onClick={() => openCellDetail(row, columnIndex)}
                            className="w-full rounded-lg px-2 py-1 hover:bg-[#fbe9dc]"
                          >
                            {formatReportValue(value)}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {hasMoreRows && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleRowCount((current) => current + VISIBLE_ROW_STEP)}
                className="rounded-2xl border border-[#d8c6b6] bg-[#fff8f3] px-5 py-3 text-sm font-semibold text-[#8B0000]"
              >
                Tải thêm dòng
              </button>
            </div>
          )}
      </div>

      {activeCellDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[30px] border border-[#d8c6b6] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#ead8ca] px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B0000]">Chi tiết ô dữ liệu</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">{activeCellDetail.rowLabel}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {activeCellDetail.columnLabel} - Tổng giá trị: {formatReportValue(activeCellDetail.totalValue) || '0'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCellDetail(null)}
                className="rounded-full border border-[#d8c6b6] p-2 text-slate-500 hover:text-[#8B0000]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              {isDetailLoading ? (
                <div className="flex items-center gap-3 text-slate-500">
                  <LoaderCircle className="h-5 w-5 animate-spin text-[#8B0000]" />
                  Đang tải chi tiết...
                </div>
              ) : detailLoadError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {detailLoadError}
                </div>
              ) : activeCellDetail.items.length === 0 ? (
                <div className="rounded-2xl border border-[#ead8ca] bg-[#fffaf6] px-4 py-4 text-sm text-slate-500">
                  Không có chi tiết đơn vị cho ô dữ liệu này.
                </div>
              ) : (
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#8B0000] text-white">
                      <th className="border border-[#c86b6b] px-4 py-3 text-left">Mã đơn vị</th>
                      <th className="border border-[#c86b6b] px-4 py-3 text-left">Tên đơn vị</th>
                      <th className="border border-[#c86b6b] px-4 py-3 text-right">Giá trị</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCellDetail.items.map((item, index) => (
                      <tr key={`${item.unitCode}-${item.value}-${index}`} className="odd:bg-white even:bg-[#fffaf6]">
                        <td className="border border-[#ead8ca] px-4 py-3 font-medium text-slate-700">{item.unitCode}</td>
                        <td className="border border-[#ead8ca] px-4 py-3 text-slate-700">{item.unitName}</td>
                        <td className="border border-[#ead8ca] px-4 py-3 text-right text-slate-700">{formatReportValue(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportView;
