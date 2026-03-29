export type HandbookSection = 'home' | 'quy-dinh' | 'hoi-dap' | 'bieu-mau' | 'tai-lieu';

export type HandbookAdminSection =
  | 'admin-home'
  | 'admin-quy-dinh'
  | 'admin-hoi-dap'
  | 'admin-bieu-mau'
  | 'admin-tai-lieu'
  | 'admin-he-thong-du-lieu';

export interface HandbookNavItem {
  id: HandbookSection;
  label: string;
  shortLabel: string;
  description: string;
}

export interface HandbookQuickLink {
  title: string;
  description: string;
  section: HandbookSection;
}

export interface HandbookNoticePreview {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
}

