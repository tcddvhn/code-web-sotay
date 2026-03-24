import * as XLSX from 'xlsx';
import { FormTemplate, HeaderLayout } from '../types';
import { columnLetterToIndex } from './columnUtils';

const NQ22_TEMPLATE_WORKBOOK_URL = '/templates/nq22-report-template.xlsx';

let cachedTemplateBufferPromise: Promise<ArrayBuffer> | null = null;

function buildHeaderLayoutFromWorksheet(
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

export async function loadTemplateWorkbookBuffer() {
  if (!cachedTemplateBufferPromise) {
    cachedTemplateBufferPromise = fetch(NQ22_TEMPLATE_WORKBOOK_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error('Không thể tải workbook mẫu NQ22.');
      }
      return response.arrayBuffer();
    });
  }

  return cachedTemplateBufferPromise;
}

export async function loadTemplateWorkbook() {
  const buffer = await loadTemplateWorkbookBuffer();
  return XLSX.read(buffer.slice(0), {
    type: 'array',
    cellStyles: true,
    cellNF: true,
    cellFormula: true,
  });
}

export async function resolveTemplateHeaderLayout(template: FormTemplate) {
  try {
    const workbook = await loadTemplateWorkbook();
    const worksheet = getWorksheetForTemplate(workbook, template);
    if (worksheet) {
      const startRow = Math.max(5, template.columnMapping.startRow - 4);
      const endRow = Math.max(startRow, template.columnMapping.startRow - 1);
      const startCol = template.columnMapping.labelColumn;
      const endCol =
        template.columnMapping.dataColumns[template.columnMapping.dataColumns.length - 1] ||
        template.columnMapping.labelColumn;

      return buildHeaderLayoutFromWorksheet(worksheet, startRow, endRow, startCol, endCol);
    }
  } catch (error) {
    console.warn('Không thể đọc header layout từ workbook mẫu:', error);
  }

  return template.headerLayout || null;
}

export async function resolveTemplateRowLabels(template: FormTemplate) {
  try {
    const workbook = await loadTemplateWorkbook();
    const worksheet = getWorksheetForTemplate(workbook, template);
    if (!worksheet) {
      return [] as Array<{ sourceRow: number; label: string }>;
    }

    const rows = [];
    for (let sourceRow = template.columnMapping.startRow; sourceRow <= template.columnMapping.endRow; sourceRow += 1) {
      rows.push({
        sourceRow,
        label: readWorksheetText(worksheet, sourceRow, template.columnMapping.labelColumn),
      });
    }

    return rows;
  } catch (error) {
    console.warn('Không thể đọc nhãn dòng từ workbook mẫu:', error);
    return [] as Array<{ sourceRow: number; label: string }>;
  }
}
