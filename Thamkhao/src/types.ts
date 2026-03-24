export interface Unit {
  code: string;
  name: string;
}

export type ViewMode = 'DASHBOARD' | 'IMPORT' | 'REPORTS' | 'SETTINGS' | 'LOGIN' | 'PROJECTS' | 'LEARN_FORM';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: any;
  updatedAt: any;
}

export interface FormTemplate {
  id: string;
  projectId: string;
  name: string; // e.g., "Biểu mẫu 01"
  sheetName: string; // Tên sheet trong file Excel
  columnHeaders: string[]; // Tiêu đề cột (ví dụ: ["Tổng số", "Thành lập mới", ...])
  columnMapping: {
    labelColumn: string; // Tên cột chứa tiêu chí (ví dụ: "B")
    dataColumns: string[]; // Các cột chứa số liệu (ví dụ: ["C", "D", "E"])
    startRow: number;
    endRow: number;
  };
  createdAt: any;
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
}

export interface ConsolidatedData {
  [templateId: string]: DataRow[];
}

export interface AppSettings {
  oneDriveLink: string;
  storagePath: string;
  receivedPath: string;
}
