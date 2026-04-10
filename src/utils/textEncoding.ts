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

const MOJIBAKE_MARKERS = /[ÃÂÆÄÅÐÑÒÓÔÕÖØÙÚÛÜÝÞß]/g;
const VIETNAMESE_MARKERS = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/gi;

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

const scoreDisplayString = (value: string) => {
  const mojibakePenalty = (value.match(MOJIBAKE_MARKERS)?.length || 0) * 4;
  const replacementPenalty = (value.match(/�/g)?.length || 0) * 6;
  const vietnameseBonus = value.match(VIETNAMESE_MARKERS)?.length || 0;
  return vietnameseBonus - mojibakePenalty - replacementPenalty;
};

export const repairLegacyUtf8 = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  let current = value;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = decodeUtf8Candidate(current);
    if (!candidate || candidate === current) {
      break;
    }
    if (scoreDisplayString(candidate) < scoreDisplayString(current)) {
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
  return repairLegacyUtf8(displayName) || repairLegacyUtf8(email) || fallback;
};
