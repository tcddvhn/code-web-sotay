import * as XLSX from 'xlsx';
import { getPublicUrlByPath } from '../supabase';
import { FormTemplate, HeaderLayout } from '../types';
import { columnIndexToLetter, columnLetterToIndex } from './columnUtils';

const NQ22_TEMPLATE_WORKBOOK_URL = '/templates/nq22-report-template.xlsx';
const TEMPLATE_FETCH_TIMEOUT_MS = 8000;

const cachedTemplateBufferPromises = new Map<string, Promise<ArrayBuffer>>();

export function buildWorksheetLayoutFromWorksheet(
  worksheet: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  startColLetter: string,
  endColLetter: string,
): HeaderLayout {
  const startCol = columnLetterToIndex(startColLetter);
  const endCol = columnLetterToIndex(endColLetter);
  const cells: HeaderLayout['cells'] = [];

  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
      const value = cell?.v ?? cell?.w;
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        cells.push({ row: r, col: c, value: String(value).trim() });
      }
    }
  }

  const merges = (worksheet['!merges'] || [])
    .map((merge: any) => ({
      startRow: merge.s.r + 1,
      startCol: merge.s.c + 1,
      endRow: merge.e.r + 1,
      endCol: merge.e.c + 1,
    }))
    .filter(
      (merge: any) =>
        merge.endRow >= startRow &&
        merge.startRow <= endRow &&
        merge.endCol >= startCol &&
        merge.startCol <= endCol,
    );

  return {
    startRow,
    endRow,
    startCol,
    endCol,
    cells,
    merges,
  };
}

function getWorksheetForTemplate(workbook: XLSX.WorkBook, template: FormTemplate) {
  return workbook.Sheets[template.sheetName] || null;
}

function readWorksheetText(worksheet: XLSX.WorkSheet, row: number, col: string) {
  const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: columnLetterToIndex(col) - 1 })];
  const value = cell?.w ?? cell?.v;
  return value === undefined || value === null ? '' : String(value).trim();
}

function readWorksheetTextInColumnRange(worksheet: XLSX.WorkSheet, row: number, startCol: string, endCol: string) {
  const labelRangeStartIndex = Math.min(columnLetterToIndex(startCol), columnLetterToIndex(endCol));
  const labelRangeEndIndex = Math.max(columnLetterToIndex(startCol), columnLetterToIndex(endCol));

  for (let colIndex = labelRangeStartIndex; colIndex <= labelRangeEndIndex; colIndex += 1) {
    const value = readWorksheetText(worksheet, row, columnIndexToLetter(colIndex));
    if (value) {
      return value;
    }
  }

  return '';
}

function readBlockTitle(
  worksheet: XLSX.WorkSheet,
  headerLayout: HeaderLayout | undefined,
  fallbackLabelColumnStart: string,
  fallbackLabelColumnEnd: string,
) {
  if (headerLayout) {
    const startCol = columnIndexToLetter(headerLayout.startCol);
    const endCol = columnIndexToLetter(headerLayout.endCol);
    for (let row = headerLayout.startRow; row <= headerLayout.endRow; row += 1) {
      const value = readWorksheetTextInColumnRange(worksheet, row, startCol, endCol);
      if (value) {
        return value;
      }
    }
  }

  return readWorksheetTextInColumnRange(worksheet, 1, fallbackLabelColumnStart, fallbackLabelColumnEnd);
}

function readWorksheetRowLabel(worksheet: XLSX.WorkSheet, row: number, template: FormTemplate) {
  const primaryLabelColumn =
    template.columnMapping.primaryLabelColumn ||
    template.columnMapping.labelColumn ||
    template.columnMapping.labelColumnStart ||
    'A';
  const directLabel = readWorksheetText(worksheet, row, primaryLabelColumn);
  if (directLabel) {
    return directLabel;
  }

  const startLabelColumn = template.columnMapping.labelColumnStart || template.columnMapping.labelColumn || primaryLabelColumn;
  const endLabelColumn = template.columnMapping.labelColumnEnd || template.columnMapping.labelColumn || primaryLabelColumn;
  const rangeLabel = readWorksheetTextInColumnRange(worksheet, row, startLabelColumn, endLabelColumn);
  if (rangeLabel) {
    return rangeLabel;
  }

  const worksheetRef = worksheet['!ref'];
  if (!worksheetRef) {
    return '';
  }

  const range = XLSX.utils.decode_range(worksheetRef);
  const startColIndex = Math.max(
    1,
    Math.min(
      columnLetterToIndex(template.columnMapping.labelColumn),
      ...template.columnMapping.dataColumns.map((column) => columnLetterToIndex(column)),
    ),
  );
  const endColIndex = Math.max(
    startColIndex,
    ...template.columnMapping.dataColumns.map((column) => columnLetterToIndex(column)),
    range.e.c + 1,
  );

  for (let colIndex = startColIndex; colIndex <= endColIndex; colIndex += 1) {
    const value = readWorksheetText(worksheet, row, columnIndexToLetter(colIndex));
    if (value) {
      return value;
    }
  }

  return '';
}

export function resolveTemplateEffectiveEndRowFromWorksheet(worksheet: XLSX.WorkSheet, template: FormTemplate) {
  const worksheetRef = worksheet['!ref'];
  if (!worksheetRef) {
    return template.columnMapping.endRow;
  }

  const range = XLSX.utils.decode_range(worksheetRef);
  const worksheetMaxRow = range.e.r + 1;

  // Với biểu mẫu thủ công, endRow là mốc nghiệp vụ đã được admin chốt.
  // Không tự quét xuống dưới nữa để tránh nuốt cả phần ghi chú/chữ ký cuối sheet.
  return Math.max(template.columnMapping.startRow, Math.min(template.columnMapping.endRow, worksheetMaxRow));
}

export async function loadTemplateWorkbookBuffer() {
  return loadTemplateWorkbookBufferFromUrl(NQ22_TEMPLATE_WORKBOOK_URL);
}

function resolveTemplateWorkbookUrl(template?: FormTemplate | null) {
  const directUrl = template?.sourceWorkbookUrl?.trim();
  if (directUrl) {
    return directUrl;
  }

  const sourcePath = template?.sourceWorkbookPath?.trim();
  if (sourcePath) {
    return getPublicUrlByPath(sourcePath);
  }

  return NQ22_TEMPLATE_WORKBOOK_URL;
}

async function loadTemplateWorkbookBufferFromUrl(url: string) {
  if (!cachedTemplateBufferPromises.has(url)) {
    cachedTemplateBufferPromises.set(
      url,
      (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), TEMPLATE_FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`Không thể tải workbook mẫu từ ${url}.`);
          }
          return response.arrayBuffer();
        } catch (error) {
          // Allow retry in future calls when the current request fails/timeouts.
          cachedTemplateBufferPromises.delete(url);
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(`Tải workbook mẫu quá thời gian (${TEMPLATE_FETCH_TIMEOUT_MS}ms): ${url}.`);
          }
          throw error;
        } finally {
          window.clearTimeout(timeout);
        }
      })(),
    );
  }

  return cachedTemplateBufferPromises.get(url)!;
}

export async function loadTemplateWorkbook(template?: FormTemplate | null) {
  const buffer = await loadTemplateWorkbookBufferFromUrl(resolveTemplateWorkbookUrl(template));
  return XLSX.read(buffer.slice(0), {
    type: 'array',
    cellStyles: true,
    cellNF: true,
    cellFormula: true,
  });
}

export async function resolveTemplateHeaderLayout(template: FormTemplate) {
  try {
    const workbook = await loadTemplateWorkbook(template);
    const worksheet = getWorksheetForTemplate(workbook, template);
    if (worksheet) {
      const startRow = template.headerLayout?.startRow ?? Math.max(5, template.columnMapping.startRow - 4);
      const endRow = template.headerLayout?.endRow ?? Math.max(startRow, template.columnMapping.startRow - 1);
      const startCol = template.headerLayout
        ? columnIndexToLetter(template.headerLayout.startCol)
        : template.columnMapping.labelColumnStart || template.columnMapping.labelColumn;
      const endCol = template.headerLayout
        ? columnIndexToLetter(template.headerLayout.endCol)
        : template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] ||
          template.columnMapping.labelColumn;

      return buildWorksheetLayoutFromWorksheet(worksheet, startRow, endRow, startCol, endCol);
    }
  } catch (error) {
    console.warn('Không thể đọc header layout từ workbook mẫu:', error);
  }

  return template.headerLayout || null;
}

export async function resolveTemplateRowLabels(template: FormTemplate) {
  try {
    const workbook = await loadTemplateWorkbook(template);
    const worksheet = getWorksheetForTemplate(workbook, template);
    if (!worksheet) {
      return [] as Array<{ sourceRow: number; label: string }>;
    }

    const configuredBlocks = template.columnMapping.blocks || [];
    if (configuredBlocks.length > 0) {
      const rows = configuredBlocks.flatMap((block) => {
        const blockSpecialRows = new Set(block.specialRows || []);
        const blockTitle =
          readBlockTitle(
            worksheet,
            block.headerLayout,
            block.labelColumnStart || template.columnMapping.labelColumnStart || template.columnMapping.labelColumn,
            block.labelColumnEnd || template.columnMapping.labelColumnEnd || template.columnMapping.labelColumn,
          ) || block.name;

        const blockRows: Array<{ sourceRow: number; label: string }> = [];
        for (let sourceRow = block.startRow; sourceRow <= block.endRow; sourceRow += 1) {
          if (blockSpecialRows.has(sourceRow)) {
            continue;
          }

          const directLabel = readWorksheetText(
            worksheet,
            sourceRow,
            block.primaryLabelColumn || template.columnMapping.primaryLabelColumn || template.columnMapping.labelColumn,
          );
          const rangeLabel = readWorksheetTextInColumnRange(
            worksheet,
            sourceRow,
            block.labelColumnStart || template.columnMapping.labelColumnStart || template.columnMapping.labelColumn,
            block.labelColumnEnd || template.columnMapping.labelColumnEnd || template.columnMapping.labelColumn,
          );

          blockRows.push({
            sourceRow,
            label: directLabel || rangeLabel || blockTitle,
          });
        }

        return blockRows;
      });

      return rows;
    }

    const effectiveEndRow = resolveTemplateEffectiveEndRowFromWorksheet(worksheet, template);
    const rows = [];
    for (let sourceRow = template.columnMapping.startRow; sourceRow <= effectiveEndRow; sourceRow += 1) {
      rows.push({
        sourceRow,
        label: readWorksheetRowLabel(worksheet, sourceRow, template),
      });
    }

    return rows;
  } catch (error) {
    console.warn('Không thể đọc nhãn dòng từ workbook mẫu:', error);
    return [] as Array<{ sourceRow: number; label: string }>;
  }
}
