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

export interface DataRow {
  unitCode: string;
  year: string;
  sheetName: string;
  sourceRow: number;
  label: string;
  values: number[];
}

export interface ConsolidatedData {
  [sheetName: string]: DataRow[];
}

export type ViewMode = 'IMPORT' | 'REPORTS' | 'SETTINGS' | 'DASHBOARD' | 'LOGIN';

export interface AppSettings {
  oneDriveLink: string;
  storagePath: string;
  receivedPath: string;
}
