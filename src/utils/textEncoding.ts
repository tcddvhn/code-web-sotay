const WINDOWS_1252_MAP = new Map<string, number>([
  ['€', 0x80],
  ['‚', 0x82],
  ['ƒ', 0x83],
  ['„', 0x84],
  ['…', 0x85],
  ['†', 0x86],
  ['‡', 0x87],
  ['ˆ', 0x88],
  ['‰', 0x89],
  ['Š', 0x8a],
  ['‹', 0x8b],
  ['Œ', 0x8c],
  ['Ž', 0x8e],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['˜', 0x98],
  ['™', 0x99],
  ['š', 0x9a],
  ['›', 0x9b],
  ['œ', 0x9c],
  ['ž', 0x9e],
  ['Ÿ', 0x9f],
]);

const MOJIBAKE_MARKERS = /[ÃÂÆÄÅÐÑÒÓÔÕÖØÙÚÛÜÝÞß€™œžŸ]/;

const encodeExtendedLatin1 = (value: string) => {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = WINDOWS_1252_MAP.get(char);
    if (mapped === undefined) {
      return null;
    }
    bytes.push(mapped);
  }
  return Uint8Array.from(bytes);
};

const decodeUtf8Candidate = (value: string) => {
  try {
    const bytes = encodeExtendedLatin1(value);
    if (!bytes) {
      return null;
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
};

export const repairLegacyUtf8 = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  let current = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!MOJIBAKE_MARKERS.test(current)) {
      break;
    }
    const candidate = decodeUtf8Candidate(current);
    if (!candidate || candidate === current) {
      break;
    }
    if (candidate.includes('�') || candidate.includes('?')) {
      break;
    }
    current = candidate;
  }

  return current;
};

export const getReadableDisplayName = (
  displayName?: string | null,
  email?: string | null,
  fallback = 'Chưa rõ',
) => {
  const normalizedEmail = email?.trim().toLowerCase() || '';
  if (normalizedEmail && KNOWN_DISPLAY_NAME_BY_EMAIL[normalizedEmail]) {
    return KNOWN_DISPLAY_NAME_BY_EMAIL[normalizedEmail];
  }
  return repairLegacyUtf8(displayName) || repairLegacyUtf8(email) || fallback;
};
const KNOWN_DISPLAY_NAME_BY_EMAIL: Record<string, string> = {
  'admin@sotay.com': 'Lê Đình Kiên',
  'nguyenthugiang@sotay.com': 'Nguyễn Thu Giang',
  'nguyenhuuhung@sotay.com': 'Nguyễn Hữu Hùng',
  'nguyensinghiem@sotay.com': 'Nguyễn Sĩ Nghiêm',
  'phamthithuhanh@sotay.com': 'Phạm Thị Thu Hạnh',
  'tranthikieuanh@sotay.com': 'Trần Thị Kiều Anh',
  'tranphuongha@sotay.com': 'Trần Phương Hà',
  'trieuthingoc@sotay.com': 'Triệu Thị Ngọc',
};
