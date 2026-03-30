export type HandbookSection = 'home' | 'quy-dinh' | 'hoi-dap' | 'bieu-mau' | 'tai-lieu';

export type HandbookContentSection = Exclude<HandbookSection, 'home'>;

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
  section: HandbookContentSection;
}

export interface HandbookNoticePreview {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
}

export interface HandbookPdfRef {
  doc: string;
  page: number;
}

export interface HandbookNodeRecord {
  id: string;
  legacyId?: string | null;
  parentId?: string | null;
  section: HandbookContentSection;
  title: string;
  slug?: string | null;
  tag?: string | null;
  summaryHtml?: string | null;
  detailHtml?: string | null;
  sortOrder: number;
  level: number;
  fileUrl?: string | null;
  fileName?: string | null;
  pdfRefs: HandbookPdfRef[];
  forceAccordion: boolean;
  isPublished: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface HandbookNodeOutlineItem extends HandbookNodeRecord {
  depth: number;
  childrenCount: number;
}

export interface HandbookNoticeItem {
  id: string;
  title: string;
  content: string;
  publishedAt?: string | null;
  isPublished: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
}

export interface HandbookSectionSummary {
  section: HandbookContentSection;
  count: number;
}

export interface HandbookActivityCardItem {
  id: string;
  title: string;
  section: HandbookContentSection;
  tag?: string | null;
  updatedAt?: string | null;
}

export interface HandbookUsageCounters {
  searchLogs: number;
  viewLogs: number;
  favorites: number;
  recentViews: number;
}
