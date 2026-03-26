import { FormTemplate } from '../types';
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
