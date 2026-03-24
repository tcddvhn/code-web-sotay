import * as XLSX from 'xlsx';
import { SHEET_CONFIGS, SHEET_LABELS } from '../constants';
import { DataRow, FormTemplate } from '../types';

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

function getLabelForRow(sheetName: string, sourceRow: number) {
  const label = SHEET_LABELS[sheetName]?.find((entry) => entry.row === sourceRow)?.label;
  return label || `DÃ²ng ${sourceRow}`;
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
    throw new Error(`KhÃ´ng tÃ¬m tháº¥y cáº¥u hÃ¬nh biá»ƒu ${sheetName}.`);
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`KhÃ´ng tÃ¬m tháº¥y sheet ${sheetName} trong file Excel.`);
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
      label: getLabelForRow(sheetName, sourceRow),
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
    throw new Error('KhÃ´ng tÃ¬m tháº¥y sheet phÃ¹ há»£p trong file Excel.');
  }

  const { labelColumn, dataColumns, startRow, endRow } = template.columnMapping;
  const rows: DataRow[] = [];

  for (let r = startRow; r <= endRow; r += 1) {
    const labelCell = worksheet[`${labelColumn}${r}`];
    if (!labelCell || !labelCell.v) {
      continue;
    }

    const values = dataColumns.map((col) => {
      const cell = worksheet[`${col}${r}`];
      return normalizeCellValue(cell?.v ?? cell?.w);
    });

    rows.push({
      projectId: template.projectId,
      templateId: template.id,
      unitCode,
      year,
      sourceRow: r,
      label: String(labelCell.v),
      values,
    });
  }

  if (rows.length === 0) {
    throw new Error('KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u phÃ¹ há»£p trong file.');
  }

  return rows;
}
