export interface SheetConfig {
  name: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface Unit {
  code: string;
  name: string;
}

export interface ManagedUnit extends Unit {
  isDeleted?: boolean;
  deletedAt?: any;
  deletedBy?: {
    uid?: string;
    email?: string | null;
    displayName?: string | null;
  };
  createdAt?: any;
  updatedAt?: any;
}

export interface DataRow {
  projectId: string;
  templateId: string;
  unitCode: string;
  year: string;
  sourceRow: number;
  label: string;
  values: number[];
  updatedAt?: any;
  updatedBy?: {
    uid?: string;
    email?: string | null;
    displayName?: string | null;
  };
}

export interface DataFileRecordSummary {
  id: string;
  projectId: string;
  unitCode: string;
  unitName?: string | null;
  year: string;
  fileName: string;
  storagePath: string;
  downloadURL?: string | null;
  updatedAt?: any;
}

export interface ConsolidatedData {
  [templateId: string]: DataRow[];
}

export type ViewMode =
  | 'IMPORT'
  | 'REPORTS'
  | 'SETTINGS'
  | 'DASHBOARD'
  | 'LOGIN'
  | 'PROJECTS'
  | 'LEARN_FORM';

export interface AppSettings {
  oneDriveLink: string;
  storagePath: string;
  receivedPath: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: 'admin' | 'contributor';
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}

export interface AssignmentUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'contributor';
  userId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: any;
  updatedAt: any;
}

export type TemplateMode = 'AI' | 'MANUAL' | 'LEGACY';

export interface HeaderCell {
  row: number;
  col: number;
  value: string;
}

export interface HeaderMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface HeaderLayout {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  cells: HeaderCell[];
  merges: HeaderMerge[];
}

export interface TemplateBlockConfig {
  id: string;
  name: string;
  labelColumnStart: string;
  labelColumnEnd: string;
  primaryLabelColumn: string;
  dataColumns: string[];
  columnHeaders?: string[];
  startRow: number;
  endRow: number;
  specialRows?: number[];
  headerLayout?: HeaderLayout;
}

export interface SheetSignatureConfig {
  headerStartRow: number;
  headerEndRow: number;
  headerStartCol: string;
  headerEndCol: string;
  startRowText?: string;
  endRowText?: string;
  middleRowCount?: number;
}

export interface FormTemplate {
  id: string;
  projectId: string;
  name: string;
  sheetName: string;
  isPublished?: boolean;
  columnHeaders: string[];
  columnMapping: {
    labelColumn: string;
    labelColumnStart?: string;
    labelColumnEnd?: string;
    primaryLabelColumn?: string;
    dataColumns: string[];
    startRow: number;
    endRow: number;
    specialRows?: number[];
    blocks?: TemplateBlockConfig[];
    sheetSignature?: SheetSignatureConfig;
  };
  headerLayout?: HeaderLayout;
  mode: TemplateMode;
  legacyConfigName?: string;
  sourceWorkbookName?: string;
  sourceWorkbookPath?: string;
  sourceWorkbookUrl?: string;
  createdAt: any;
  updatedAt?: any;
}
