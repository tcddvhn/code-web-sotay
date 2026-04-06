import { DEFAULT_REPORTING_YEAR, YEARS } from '../constants';

const PINNED_YEAR_STORAGE_KEY = 'sotay:pinned-reporting-year';

export function getPinnedYearPreference(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(PINNED_YEAR_STORAGE_KEY);
  return value && YEARS.includes(value) ? value : null;
}

export function getPreferredReportingYear(): string {
  const pinnedYear = getPinnedYearPreference();

  if (pinnedYear) {
    return pinnedYear;
  }

  return YEARS.includes(DEFAULT_REPORTING_YEAR) ? DEFAULT_REPORTING_YEAR : YEARS[0];
}

export function setPinnedYearPreference(year: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (year && YEARS.includes(year)) {
    window.localStorage.setItem(PINNED_YEAR_STORAGE_KEY, year);
    return;
  }

  window.localStorage.removeItem(PINNED_YEAR_STORAGE_KEY);
}
