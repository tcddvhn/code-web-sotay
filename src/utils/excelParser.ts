import * as XLSX from 'xlsx';
import { SHEET_CONFIGS, SHEET_LABELS } from '../constants';
import { DataRow } from '../types';

export interface ParsedWorkbookResult {
  rows: DataRow[];
  importedSheets: string[];
  missingSheets: string[];
}

function normalizeCellValue(value: unknown): number {
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
  return label || `Dòng ${sourceRow}`;
}

export async function parseExcelReportFile(
  file: File,
  unitCode: string,
  year: string,
): Promise<ParsedWorkbookResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, {
    type: 'array',
    cellFormula: true,
    cellHTML: false,
    cellText: false,
  });

  const rows: DataRow[] = [];
  const importedSheets: string[] = [];
  const missingSheets: string[] = [];

  for (const config of SHEET_CONFIGS) {
    const worksheet = workbook.Sheets[config.name];

    if (!worksheet) {
      missingSheets.push(config.name);
      continue;
    }

    importedSheets.push(config.name);

    for (let sourceRow = config.startRow; sourceRow <= config.endRow; sourceRow++) {
      const values: number[] = [];

      for (let sourceCol = config.startCol; sourceCol <= config.endCol; sourceCol++) {
        const cellAddress = XLSX.utils.encode_cell({ r: sourceRow - 1, c: sourceCol - 1 });
        const cell = worksheet[cellAddress];
        values.push(normalizeCellValue(cell?.v ?? cell?.w));
      }

      rows.push({
        unitCode,
        year,
        sheetName: config.name,
        sourceRow,
        label: getLabelForRow(config.name, sourceRow),
        values,
      });
    }
  }

  if (importedSheets.length === 0) {
    throw new Error('Không tìm thấy biểu hợp lệ trong file Excel.');
  }

  return {
    rows,
    importedSheets,
    missingSheets,
  };
}
