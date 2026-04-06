import * as XLSX from 'xlsx';
import { SHEET_CONFIGS } from '../constants';
import { DataRow, FormTemplate, TemplateBlockConfig } from '../types';
import { columnIndexToLetter, columnLetterToIndex } from './columnUtils';
import { resolveTemplateEffectiveEndRowFromWorksheet } from './templateWorkbook';

export function normalizeCellValue(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return 0;
  }

  const compactValue = rawValue.replace(/\s+/g, '');
  const normalizedValue = compactValue
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getLabelForRow(worksheet: XLSX.WorkSheet, sourceRow: number) {
  const labelCell = worksheet[XLSX.utils.encode_cell({ r: sourceRow - 1, c: 0 })];
  const label = labelCell?.v ?? labelCell?.w;
  return label ? String(label).trim() : `Dòng ${sourceRow}`;
}

function readWorksheetCellText(worksheet: XLSX.WorkSheet, row: number, column: string) {
  const cell = worksheet[`${column}${row}`];
  const value = cell?.w ?? cell?.v;
  return value === undefined || value === null ? '' : String(value).trim();
}

function readWorksheetTextInRange(worksheet: XLSX.WorkSheet, row: number, startColumn: string, endColumn: string) {
  const startColIndex = Math.min(columnLetterToIndex(startColumn), columnLetterToIndex(endColumn));
  const endColIndex = Math.max(columnLetterToIndex(startColumn), columnLetterToIndex(endColumn));

  for (let colIndex = startColIndex; colIndex <= endColIndex; colIndex += 1) {
    const value = readWorksheetCellText(worksheet, row, columnIndexToLetter(colIndex));
    if (value) {
      return value;
    }
  }

  return '';
}

function readBlockTitle(worksheet: XLSX.WorkSheet, block: TemplateBlockConfig) {
  if (block.headerLayout) {
    const startColumn = columnIndexToLetter(block.headerLayout.startCol);
    const endColumn = columnIndexToLetter(block.headerLayout.endCol);
    for (let row = block.headerLayout.startRow; row <= block.headerLayout.endRow; row += 1) {
      const value = readWorksheetTextInRange(worksheet, row, startColumn, endColumn);
      if (value) {
        return value;
      }
    }
  }

  return block.name || '';
}

function readTemplateRowLabel(worksheet: XLSX.WorkSheet, row: number, template: FormTemplate) {
  const primaryLabelColumn =
    template.columnMapping.primaryLabelColumn ||
    template.columnMapping.labelColumn ||
    template.columnMapping.labelColumnStart ||
    'A';
  const directLabel = readWorksheetCellText(worksheet, row, primaryLabelColumn);
  if (directLabel) {
    return directLabel;
  }

  const startLabelColumn = template.columnMapping.labelColumnStart || template.columnMapping.labelColumn || primaryLabelColumn;
  const endLabelColumn = template.columnMapping.labelColumnEnd || template.columnMapping.labelColumn || primaryLabelColumn;
  const rangeLabel = readWorksheetTextInRange(worksheet, row, startLabelColumn, endLabelColumn);
  if (rangeLabel) {
    return rangeLabel;
  }

  return '';
}

function readBlockRowLabel(worksheet: XLSX.WorkSheet, row: number, template: FormTemplate, block: TemplateBlockConfig) {
  const primaryLabelColumn =
    block.primaryLabelColumn ||
    template.columnMapping.primaryLabelColumn ||
    block.labelColumnStart ||
    template.columnMapping.labelColumn;
  const directLabel = readWorksheetCellText(worksheet, row, primaryLabelColumn);
  if (directLabel) {
    return directLabel;
  }

  const startLabelColumn = block.labelColumnStart || template.columnMapping.labelColumnStart || template.columnMapping.labelColumn;
  const endLabelColumn = block.labelColumnEnd || template.columnMapping.labelColumnEnd || template.columnMapping.labelColumn;
  const rangeLabel = readWorksheetTextInRange(worksheet, row, startLabelColumn, endLabelColumn);
  if (rangeLabel) {
    return rangeLabel;
  }

  return readBlockTitle(worksheet, block);
}

export async function parseLegacySheet(
  file: File,
  unitCode: string,
  year: string,
  sheetName: string,
  projectId: string,
  templateId: string,
): Promise<DataRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellFormula: true, cellHTML: false, cellText: false });
  return parseLegacyFromWorkbook(workbook, unitCode, year, sheetName, projectId, templateId);
}

export async function parseTemplateSheet(
  file: File,
  template: FormTemplate,
  unitCode: string,
  year: string,
): Promise<DataRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  return parseTemplateFromWorkbook(workbook, template, unitCode, year);
}

export function parseLegacyFromWorkbook(
  workbook: XLSX.WorkBook,
  unitCode: string,
  year: string,
  sheetName: string,
  projectId: string,
  templateId: string,
): DataRow[] {
  const config = SHEET_CONFIGS.find((cfg) => cfg.name === sheetName);
  if (!config) {
    throw new Error(`Không tìm thấy cấu hình biểu ${sheetName}.`);
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Không tìm thấy sheet ${sheetName} trong file Excel.`);
  }

  const rows: DataRow[] = [];
  for (let sourceRow = config.startRow; sourceRow <= config.endRow; sourceRow++) {
    const values: number[] = [];
    for (let sourceCol = config.startCol; sourceCol <= config.endCol; sourceCol++) {
      const cellAddress = XLSX.utils.encode_cell({ r: sourceRow - 1, c: sourceCol - 1 });
      const cell = worksheet[cellAddress];
      values.push(normalizeCellValue(cell?.v ?? cell?.w));
    }
    rows.push({
      projectId,
      templateId,
      unitCode,
      year,
      sourceRow,
      label: getLabelForRow(worksheet, sourceRow),
      values,
    });
  }

  return rows;
}

export function parseTemplateFromWorkbook(
  workbook: XLSX.WorkBook,
  template: FormTemplate,
  unitCode: string,
  year: string,
): DataRow[] {
  const worksheet = workbook.Sheets[template.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) {
    throw new Error('Không tìm thấy sheet phù hợp trong file Excel.');
  }

  const configuredBlocks = template.columnMapping.blocks || [];
  if (configuredBlocks.length > 0) {
    const rows: DataRow[] = [];

    configuredBlocks.forEach((block) => {
      const blockSpecialRows = new Set(block.specialRows || []);

      for (let r = block.startRow; r <= block.endRow; r += 1) {
        if (blockSpecialRows.has(r)) {
          continue;
        }

        const values = block.dataColumns.map((col) => {
          const cell = worksheet[`${col}${r}`];
          return normalizeCellValue(cell?.v ?? cell?.w);
        });

        const hasAnyDataCell = block.dataColumns.some((col) => {
          const cell = worksheet[`${col}${r}`];
          return cell !== undefined && cell !== null && String(cell.v ?? cell.w ?? '').trim() !== '';
        });

        const labelText = readBlockRowLabel(worksheet, r, template, block);
        if (!labelText && !hasAnyDataCell) {
          continue;
        }

        rows.push({
          projectId: template.projectId,
          templateId: template.id,
          unitCode,
          year,
          sourceRow: r,
          label: labelText || block.name || `Dòng ${r}`,
          values,
        });
      }
    });

    if (rows.length === 0) {
      throw new Error('Không tìm thấy dữ liệu phù hợp trong file.');
    }

    return rows;
  }

  const { dataColumns, startRow } = template.columnMapping;
  const effectiveEndRow = resolveTemplateEffectiveEndRowFromWorksheet(worksheet, template);
  const specialRows = new Set(template.columnMapping.specialRows || []);
  const rows: DataRow[] = [];

  for (let r = startRow; r <= effectiveEndRow; r += 1) {
    if (specialRows.has(r)) {
      continue;
    }

    const labelText = readTemplateRowLabel(worksheet, r, template);

    const values = dataColumns.map((col) => {
      const cell = worksheet[`${col}${r}`];
      return normalizeCellValue(cell?.v ?? cell?.w);
    });

    const hasVisibleLabel = labelText !== '';
    const hasAnyDataCell = dataColumns.some((col) => {
      const cell = worksheet[`${col}${r}`];
      return cell !== undefined && cell !== null && String(cell.v ?? cell.w ?? '').trim() !== '';
    });

    if (!hasVisibleLabel && !hasAnyDataCell) {
      continue;
    }

    rows.push({
      projectId: template.projectId,
      templateId: template.id,
      unitCode,
      year,
      sourceRow: r,
      label: labelText || `Dòng ${r}`,
      values,
    });
  }

  if (rows.length === 0) {
    throw new Error('Không tìm thấy dữ liệu phù hợp trong file.');
  }

  return rows;
}
