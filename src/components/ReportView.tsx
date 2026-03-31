
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
  buildWorksheetLayoutFromWorksheet,
  loadTemplateWorkbook,
  resolveTemplateEffectiveEndRowFromWorksheet,
  resolveTemplateHeaderLayout,
  resolveTemplateRowLabels,
} from '../utils/templateWorkbook';
import { columnLetterToIndex } from '../utils/columnUtils';

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

interface RenderableLayoutCell {
  text: string;
  rowSpan: number;
  colSpan: number;
  row: number;
  col: number;
  isDataCell: boolean;
  sourceRow?: number;
  columnIndex?: number;
}

interface TemplateWorksheetSection {
  id: string;
  layout: HeaderLayout;
  headerEndRow: number;
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

function buildRenderableLayoutRows(
  layout: HeaderLayout,
  dataCellMap: Map<string, { sourceRow: number; columnIndex: number }> = new Map(),
) {
  const rowCount = layout.endRow - layout.startRow + 1;
  const colCount = layout.endCol - layout.startCol + 1;

  if (rowCount <= 0 || colCount <= 0) {
    return null;
  }

  const cellMap = new Map(layout.cells.map((cell) => [`${cell.row}:${cell.col}`, cell.value]));
  const mergeMap = new Map((layout.merges || []).map((merge) => [`${merge.startRow}:${merge.startCol}`, merge]));
  const occupied = Array.from({ length: rowCount }, () => Array(colCount).fill(false));
  const rows: RenderableLayoutCell[][] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowCells: RenderableLayoutCell[] = [];

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

      const meta = dataCellMap.get(`${rowNumber}:${colNumber}`);
      rowCells.push({
        text: cellMap.get(`${rowNumber}:${colNumber}`) || '',
        rowSpan,
        colSpan,
        row: rowNumber,
        col: colNumber,
        isDataCell: Boolean(meta),
        sourceRow: meta?.sourceRow,
        columnIndex: meta?.columnIndex,
      });
    }

    rows.push(rowCells);
  }

  return rows;
}

function templateHasWorkbookSource(template: FormTemplate | null) {
  if (!template) {
    return false;
  }

  return Boolean(template.sourceWorkbookUrl?.trim() || template.sourceWorkbookPath?.trim());
}

function templateUsesWorkbookRender(template: FormTemplate | null) {
  if (!template) {
    return false;
  }

  const hasBlocks = (template.columnMapping.blocks || []).length > 0;
  const hasLabelRange =
    Boolean(template.columnMapping.labelColumnStart && template.columnMapping.labelColumnEnd) &&
    template.columnMapping.labelColumnStart !== template.columnMapping.labelColumnEnd;

  return hasBlocks || hasLabelRange;
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

  const configuredBlocks = template.columnMapping.blocks || [];
  if (configuredBlocks.length > 0) {
    configuredBlocks.forEach((block) => {
      const blockSpecialRows = new Set(block.specialRows || []);
      for (let sourceRow = block.startRow; sourceRow <= block.endRow; sourceRow += 1) {
        if (blockSpecialRows.has(sourceRow)) {
          continue;
        }

        const rowValues = valueMap.get(sourceRow) || new Array(block.dataColumns.length).fill(0);
        block.dataColumns.forEach((columnLetter, columnIndex) => {
          const address = `${columnLetter}${sourceRow}`;
          setWorksheetCellValue(worksheet, address, rowValues[columnIndex] || 0);
        });
      }
    });
    return;
  }

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

function buildWorkbookDisplaySections(worksheet: XLSX.WorkSheet, template: FormTemplate) {
  const blocks = template.columnMapping.blocks || [];

  if (blocks.length > 0) {
    return blocks
      .map((block, index) => {
        const startColLetter =
          block.labelColumnStart || XLSX.utils.encode_col((block.headerLayout?.startCol || 1) - 1);
        const endColLetter =
          block.dataColumns[block.dataColumns.length - 1] ||
          XLSX.utils.encode_col((block.headerLayout?.endCol || block.headerLayout?.startCol || 1) - 1);
        const blockLayout = buildWorksheetLayoutFromWorksheet(
          worksheet,
          block.headerLayout?.startRow || block.startRow,
          block.endRow,
          startColLetter,
          endColLetter,
        );

        return {
          id: block.id || `block_${index + 1}`,
          layout: blockLayout,
          headerEndRow: block.headerLayout?.endRow || block.startRow,
        } satisfies TemplateWorksheetSection;
      })
      .filter((section) => section.layout.cells.length > 0 || section.layout.merges.length > 0);
  }

  const effectiveEndRow = resolveTemplateEffectiveEndRowFromWorksheet(worksheet, template);
  const startColLetter = template.columnMapping.labelColumnStart || template.columnMapping.labelColumn;
  const endColLetter =
    template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] || template.columnMapping.labelColumn;
  const fallbackStartRow = template.headerLayout?.startRow ?? Math.max(1, template.columnMapping.startRow - 2);
  const fallbackHeaderEndRow = template.headerLayout?.endRow ?? Math.max(fallbackStartRow, template.columnMapping.startRow - 1);

  const layout = buildWorksheetLayoutFromWorksheet(
    worksheet,
    fallbackStartRow,
    effectiveEndRow,
    startColLetter,
    endColLetter,
  );

  return [
    {
      id: 'primary',
      layout,
      headerEndRow: fallbackHeaderEndRow,
    } satisfies TemplateWorksheetSection,
  ];
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
  const [advancedSections, setAdvancedSections] = useState<TemplateWorksheetSection[]>([]);
  const [isWorkbookLayoutLoading, setIsWorkbookLayoutLoading] = useState(false);
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_VISIBLE_ROWS);
  const [supabaseAggregatedRows, setSupabaseAggregatedRows] = useState<AggregatedReportRow[]>([]);
  const [isSupabaseLoadingRows, setIsSupabaseLoadingRows] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const unitNameByCode = useMemo(() => new Map(units.map((unit) => [unit.code, unit.name])), [units]);

  const projectTemplates = useMemo(
    () => templates.filter((template) => template.projectId === selectedProjectId),
    [templates, selectedProjectId],
  );
  const selectedTemplate = projectTemplates.find((template) => template.id === selectedTemplateId) || null;
  const usesWorkbookBasedLayout = templateUsesWorkbookRender(selectedTemplate) && templateHasWorkbookSource(selectedTemplate);
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
      setAdvancedSections([]);
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
    if (!selectedTemplate || !usesWorkbookBasedLayout) {
      setAdvancedSections([]);
      setIsWorkbookLayoutLoading(false);
      return;
    }

    let cancelled = false;
    setIsWorkbookLayoutLoading(true);

    loadTemplateWorkbook(selectedTemplate)
      .then((workbook) => {
        if (cancelled) {
          return;
        }

        const worksheet = workbook.Sheets[selectedTemplate.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) {
          setAdvancedSections([]);
          return;
        }

        populateTemplateWorksheet(worksheet, selectedTemplate, data, selectedYear, selectedUnitCode);
        const sections = buildWorkbookDisplaySections(worksheet, selectedTemplate);
        if (!cancelled) {
          setAdvancedSections(sections);
        }
      })
      .catch((error) => {
        console.error('Không thể dựng layout workbook cho biểu nâng cao:', error);
        if (!cancelled) {
          setAdvancedSections([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsWorkbookLayoutLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data, selectedTemplate, selectedUnitCode, selectedYear, usesWorkbookBasedLayout]);

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
      return [] as number[];
    }

    return Array.from({ length: tableColSpan }, (_, index) => {
      if (index === 0) {
        return estimateReportColumnWidth(index, 'Tiêu chí', tableColSpan);
      }

      return estimateReportColumnWidth(index, columnHeaders[index - 1] || `Cột ${index}`, tableColSpan);
    });
  }, [columnHeaders, tableColSpan]);
  const sortedDetailItems = useMemo(() => {
    if (!activeCellDetail) {
      return [] as CellDetailItem[];
    }

    return [...activeCellDetail.items]
      .filter((item) => item.value !== 0)
      .sort((left, right) => {
        const codeCompare = left.unitCode.localeCompare(right.unitCode, 'vi', {
          numeric: true,
          sensitivity: 'base',
        });
        if (codeCompare !== 0) {
          return codeCompare;
        }

        return left.unitName.localeCompare(right.unitName, 'vi');
      });
  }, [activeCellDetail]);
  const contributingUnitCount = sortedDetailItems.length;
  const aggregatedRowsBySourceRow = useMemo(
    () => new Map(aggregatedRows.map((row) => [row.sourceRow, row])),
    [aggregatedRows],
  );
  const advancedRenderedSections = useMemo(() => {
    if (!selectedTemplate || advancedSections.length === 0) {
      return [] as Array<{ section: TemplateWorksheetSection; rows: RenderableLayoutCell[][] }>;
    }

    const configuredBlocks = selectedTemplate.columnMapping.blocks || [];
    const fallbackSpecialRows = new Set(selectedTemplate.columnMapping.specialRows || []);

    return advancedSections
      .filter((section) => {
        if (normalizedSearchTerm === '') {
          return true;
        }

        return section.layout.cells.some((cell) => cell.value.toLowerCase().includes(normalizedSearchTerm));
      })
      .map((section, index) => {
        const dataCellMap = new Map<string, { sourceRow: number; columnIndex: number }>();
        const block = configuredBlocks[index] || null;

        if (block) {
          const blockSpecialRows = new Set(block.specialRows || []);
          for (let sourceRow = block.startRow; sourceRow <= block.endRow; sourceRow += 1) {
            if (blockSpecialRows.has(sourceRow)) {
              continue;
            }

            block.dataColumns.forEach((columnLetter, columnIndex) => {
              dataCellMap.set(`${sourceRow}:${columnLetterToIndex(columnLetter)}`, {
                sourceRow,
                columnIndex,
              });
            });
          }
        } else {
          const effectiveEndRow = Math.max(selectedTemplate.columnMapping.startRow, selectedTemplate.columnMapping.endRow);
          for (let sourceRow = selectedTemplate.columnMapping.startRow; sourceRow <= effectiveEndRow; sourceRow += 1) {
            if (fallbackSpecialRows.has(sourceRow)) {
              continue;
            }

            selectedTemplate.columnMapping.dataColumns.forEach((columnLetter, columnIndex) => {
              dataCellMap.set(`${sourceRow}:${columnLetterToIndex(columnLetter)}`, {
                sourceRow,
                columnIndex,
              });
            });
          }
        }

        return {
          section,
          rows: buildRenderableLayoutRows(section.layout, dataCellMap) || [],
        };
      });
  }, [advancedSections, normalizedSearchTerm, selectedTemplate]);

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
            unitName: item.unit_name || unitNameByCode.get(item.unit_code) || item.unit_code,
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
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="page-title">Báo cáo tổng hợp</h2>
          <p className="page-subtitle mt-2 text-sm">Truy xuất dữ liệu theo đúng biểu mẫu, dự án, năm và đơn vị.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={exportAllTemplates}
            disabled={isExporting || projectTemplates.length === 0}
            className="secondary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isExporting ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
            Xuất toàn bộ biểu
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
      ) : usesWorkbookBasedLayout ? (
        <div className="table-shell overflow-hidden rounded-[24px] border border-[var(--line-strong)] bg-white">
          {isWorkbookLayoutLoading ? (
            <div className="p-12 text-center italic opacity-60">Đang dựng khung biểu theo file mẫu...</div>
          ) : advancedRenderedSections.length > 0 ? (
            <div className="space-y-0 overflow-x-auto">
              {advancedRenderedSections.map(({ section, rows }, sectionIndex) => (
                <table
                  key={section.id}
                  className={`w-max min-w-full border-separate border-spacing-0 table-auto bg-white ${
                    sectionIndex > 0 ? 'border-t border-[var(--line-strong)]' : ''
                  }`}
                >
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`${section.id}-row-${rowIndex}`}>
                        {row.map((cell, cellIndex) => {
                          const aggregatedRow = cell.sourceRow ? aggregatedRowsBySourceRow.get(cell.sourceRow) : null;
                          const cellValue =
                            cell.isDataCell && aggregatedRow && typeof cell.columnIndex === 'number'
                              ? aggregatedRow.values[cell.columnIndex] || 0
                              : null;
                          const isHeaderZone = cell.row <= section.headerEndRow;
                          const isPrimaryLabel = cell.col === section.layout.startCol;

                          return (
                            <td
                              key={`${section.id}-${rowIndex}-${cellIndex}`}
                              colSpan={cell.colSpan}
                              rowSpan={cell.rowSpan}
                              className={`border-b border-r border-[var(--line)] align-middle ${
                                rowIndex === 0 ? 'border-t' : ''
                              } ${
                                cellIndex === 0 ? 'border-l' : ''
                              } ${
                                isHeaderZone
                                  ? 'bg-[#faf8f4] px-3 py-2 text-center text-[13px] font-semibold leading-[1.35] text-[var(--ink)]'
                                  : isPrimaryLabel
                                    ? 'bg-white px-3 py-2 text-[13px] font-semibold leading-[1.45] text-[var(--ink)]'
                                    : 'bg-white px-0 py-0'
                              }`}
                            >
                              {cell.isDataCell && aggregatedRow && typeof cell.columnIndex === 'number' ? (
                                <button
                                  type="button"
                                  onClick={() => openCellDetail(aggregatedRow, cell.columnIndex!)}
                                  className="h-full min-h-[46px] w-full px-2 py-2 text-center text-[13px] font-medium leading-[1.35] text-[var(--ink)] transition-colors hover:bg-[var(--primary-soft)]"
                                  title="Xem chi tiết theo đơn vị"
                                >
                                  {formatReportValue(cellValue || 0)}
                                </button>
                              ) : (
                                cell.text || '\u00A0'
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center italic opacity-40">
              Không thể dựng lại khung biểu từ file mẫu. Hãy kiểm tra lại cấu hình khối tiêu đề - dữ liệu.
            </div>
          )}
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
                          } ${cellIndex === 0 ? 'sticky left-0 z-10 bg-[#f8f6f1] text-[14px] font-bold' : 'font-semibold'}`}
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
                {isSupabaseLoadingRows ? (
                  <tr>
                    <td colSpan={tableColSpan || Math.max(2, columnHeaders.length + 1)} className="p-12 text-center italic opacity-60">
                      Đang tải dữ liệu báo cáo...
                    </td>
                  </tr>
                ) : aggregatedRows.length > 0 ? (
                  aggregatedRows.slice(0, visibleRowCount).map((row) =>
                    row.isSpecial ? (
                      <tr key={row.key} className="bg-[#eef3ff]">
                        <td
                          colSpan={tableColSpan}
                          className="border-b border-r border-[var(--line)] px-3 py-2 text-center text-[13px] font-bold leading-[1.45] text-[var(--ink)]"
                        >
                          {row.label || `Dòng ${row.sourceRow}`}
                        </td>
                      </tr>
                    ) : (
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
                    ),
                  )
                ) : (
                  <tr>
                    <td colSpan={tableColSpan || Math.max(2, columnHeaders.length + 1)} className="p-12 text-center italic opacity-40">
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
                <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">
                  Có số liệu: {contributingUnitCount.toLocaleString('vi-VN')} đơn vị
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="panel-soft rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                  Sắp theo mã đơn vị tăng dần
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

export default ReportView;
