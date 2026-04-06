export function columnIndexToLetter(index: number): string {
  let n = index;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function columnLetterToIndex(letter: string): number {
  const normalized = letter.trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    if (code < 65 || code > 90) {
      continue;
    }
    result = result * 26 + (code - 64);
  }
  return result;
}
