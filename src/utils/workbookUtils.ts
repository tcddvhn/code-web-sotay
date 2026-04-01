import * as XLSX from 'xlsx';
import { FormTemplate, SheetSignatureConfig } from '../types';
import { columnIndexToLetter, columnLetterToIndex } from './columnUtils';

function normalizeColumnToken(token: string) {
  return token.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

export function expandColumnSelection(input: string) {
  const tokens = input
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const columns: string[] = [];

  tokens.forEach((token) => {
    const normalizedToken = token.toUpperCase().replace(/\s+/g, '');
    const rangeParts = normalizedToken.split('-').map(normalizeColumnToken).filter(Boolean);

    if (rangeParts.length === 2) {
      const start = columnLetterToIndex(rangeParts[0]);
      const end = columnLetterToIndex(rangeParts[1]);

      if (start > 0 && end > 0) {
        const [from, to] = start <= end ? [start, end] : [end, start];
        for (let index = from; index <= to; index += 1) {
          columns.push(columnIndexToLetter(index));
        }
        return;
      }
    }

    const normalizedColumn = normalizeColumnToken(normalizedToken);
    if (normalizedColumn) {
      columns.push(normalizedColumn);
    }
  });

  return Array.from(new Set(columns));
}

export function expandRowSelection(input: string) {
  const tokens = input
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const rows: number[] = [];

  tokens.forEach((token) => {
    const normalizedToken = token.replace(/\s+/g, '');
    const rangeParts = normalizedToken
      .split('-')
      .map((part) => Number(part.replace(/[^\d]/g, '')))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (rangeParts.length === 2) {
      const [from, to] = rangeParts[0] <= rangeParts[1] ? [rangeParts[0], rangeParts[1]] : [rangeParts[1], rangeParts[0]];
      for (let value = from; value <= to; value += 1) {
        rows.push(value);
      }
      return;
    }

    const singleValue = Number(normalizedToken.replace(/[^\d]/g, ''));
    if (Number.isFinite(singleValue) && singleValue > 0) {
      rows.push(singleValue);
    }
  });

  return Array.from(new Set(rows)).sort((left, right) => left - right);
}

export function validateWorkbookSheetNames(workbookSheetNames: string[], templates: FormTemplate[]) {
  const expectedSheets = Array.from(
    new Set(
      templates
        .map((template) => template.sheetName.trim())
        .filter(Boolean),
    ),
  );
  const incomingSheets = Array.from(new Set(workbookSheetNames.map((sheetName) => sheetName.trim()).filter(Boolean)));

  const missingSheets = expectedSheets.filter((sheetName) => !incomingSheets.includes(sheetName));
  const unexpectedSheets = incomingSheets.filter((sheetName) => !expectedSheets.includes(sheetName));

  return {
    expectedSheets,
    incomingSheets,
    missingSheets,
    unexpectedSheets,
    isValid: missingSheets.length === 0 && unexpectedSheets.length === 0,
  };
}

function normalizeSignatureText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readWorksheetCellDisplayText(worksheet: XLSX.WorkSheet, rowNumber: number, colNumber: number) {
  const address = XLSX.utils.encode_cell({ r: rowNumber - 1, c: colNumber - 1 });
  const cell = worksheet[address];
  const rawValue = cell?.w ?? cell?.v;
  return rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
}

function readWorksheetRowSignatureText(
  worksheet: XLSX.WorkSheet,
  rowNumber: number,
  startColumn: string,
  endColumn: string,
) {
  const startColIndex = Math.min(columnLetterToIndex(startColumn), columnLetterToIndex(endColumn));
  const endColIndex = Math.max(columnLetterToIndex(startColumn), columnLetterToIndex(endColumn));
  const fragments: string[] = [];

  for (let colIndex = startColIndex; colIndex <= endColIndex; colIndex += 1) {
    const text = readWorksheetCellDisplayText(worksheet, rowNumber, colIndex);
    if (text) {
      fragments.push(text);
    }
  }

  return normalizeSignatureText(fragments.join(' | '));
}

export function completeSheetSignatureFromWorksheet(
  worksheet: XLSX.WorkSheet,
  signature?: SheetSignatureConfig | null,
) {
  if (!signature) {
    return undefined;
  }

  const headerStartRow = Number(signature.headerStartRow);
  const headerEndRow = Number(signature.headerEndRow);
  const headerStartCol = signature.headerStartCol?.trim().toUpperCase();
  const headerEndCol = signature.headerEndCol?.trim().toUpperCase();

  if (
    !worksheet ||
    !Number.isFinite(headerStartRow) ||
    !Number.isFinite(headerEndRow) ||
    headerStartRow <= 0 ||
    headerEndRow <= 0 ||
    headerEndRow < headerStartRow ||
    !headerStartCol ||
    !headerEndCol
  ) {
    return undefined;
  }

  return {
    headerStartRow,
    headerEndRow,
    headerStartCol,
    headerEndCol,
    startRowText: readWorksheetRowSignatureText(worksheet, headerStartRow, headerStartCol, headerEndCol),
    endRowText: readWorksheetRowSignatureText(worksheet, headerEndRow, headerStartCol, headerEndCol),
    middleRowCount: Math.max(0, headerEndRow - headerStartRow - 1),
  } satisfies SheetSignatureConfig;
}

export function validateTemplateSheetSignature(
  workbook: XLSX.WorkBook,
  template: FormTemplate,
) {
  const signature = template.columnMapping.sheetSignature;
  const worksheet = workbook.Sheets[template.sheetName];

  if (!worksheet) {
    return {
      isValid: false,
      reason: `Thiếu sheet ${template.sheetName}.`,
      actualSignature: undefined,
    };
  }

  if (!signature) {
    return {
      isValid: true,
      reason: null,
      actualSignature: undefined,
    };
  }

  const normalizedSignature = completeSheetSignatureFromWorksheet(worksheet, signature);
  if (!normalizedSignature) {
    return {
      isValid: false,
      reason: `Biểu ${template.name} chưa cấu hình đủ chỉ số khóa để đối chiếu sheet.`,
      actualSignature: undefined,
    };
  }

  if ((signature.startRowText || '') && normalizedSignature.startRowText !== normalizeSignatureText(signature.startRowText || '')) {
    return {
      isValid: false,
      reason: `Sai chỉ số khóa sheet ${template.sheetName}: không khớp hàng tiêu đề đầu.`,
      actualSignature: normalizedSignature,
    };
  }

  if ((signature.endRowText || '') && normalizedSignature.endRowText !== normalizeSignatureText(signature.endRowText || '')) {
    return {
      isValid: false,
      reason: `Sai chỉ số khóa sheet ${template.sheetName}: không khớp hàng tiêu đề cuối.`,
      actualSignature: normalizedSignature,
    };
  }

  const expectedMiddleRowCount = Number(signature.middleRowCount ?? Math.max(0, signature.headerEndRow - signature.headerStartRow - 1));
  if (normalizedSignature.middleRowCount !== expectedMiddleRowCount) {
    return {
      isValid: false,
      reason: `Sai chỉ số khóa sheet ${template.sheetName}: không khớp số dòng giữa tiêu đề.`,
      actualSignature: normalizedSignature,
    };
  }

  return {
    isValid: true,
    reason: null,
    actualSignature: normalizedSignature,
  };
}

export function buildSheetValidationMessage(
  projectName: string,
  validation: ReturnType<typeof validateWorkbookSheetNames>,
) {
  const lines = [`File không đúng mẫu đã phát hành cho dự án "${projectName}".`];

  if (validation.missingSheets.length > 0) {
    lines.push(`Sheet còn thiếu: ${validation.missingSheets.join(', ')}`);
  }

  if (validation.unexpectedSheets.length > 0) {
    lines.push(`Sheet không đúng hoặc phát sinh thêm: ${validation.unexpectedSheets.join(', ')}`);
  }

  lines.push('Vui lòng sử dụng đúng file mẫu của dự án.');
  return lines.join('\n');
}
