export const repairLegacyUtf8 = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  let current = value;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!/[ÃÂÆÄÅÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(current)) {
      break;
    }
    try {
      const bytes = Uint8Array.from(Array.from(current).map((char) => char.charCodeAt(0) & 0xff));
      const repaired = new TextDecoder('utf-8').decode(bytes);
      if (!repaired || repaired === current || repaired.includes('�')) {
        break;
      }
      current = repaired;
    } catch {
      break;
    }
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
