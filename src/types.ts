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
  submittedAt?: any;
  submittedBy?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  updatedAt?: any;
}

export interface OverwriteRequestRecord {
  id: string;
  projectId: string;
  projectName?: string | null;
  unitCode: string;
  unitName: string;
  year: string;
  fileName: string;
  storagePath: string;
  downloadURL?: string | null;
  rowPayload: DataRow[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  reviewNote?: string | null;
  reviewedAt?: any;
  reviewedBy?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  requesterSeenAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ConsolidatedData {
  [templateId: string]: DataRow[];
}

export type ViewMode =
  | 'IMPORT'
  | 'REPORTS'
  | 'EXTRACT_REPORTS'
  | 'AI_ANALYSIS'
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
  role: 'admin' | 'contributor' | 'unit_user';
  authUserId?: string | null;
  mustChangePassword?: boolean;
  unitCode?: string | null;
  unitName?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  unitCode?: string | null;
  unitName?: string | null;
}

export interface AssignmentUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'contributor' | 'unit_user';
  userId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'COMPLETED';
  ownerDepartmentId?: string | null;
  deadlineAt?: string | null;
  createdByEmail?: string | null;
  createdByAuthUserId?: string | null;
  createdAt: any;
  updatedAt: any;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: any;
  updatedAt: any;
}

export type DepartmentMembershipRole = 'manager' | 'member';

export interface DepartmentMember {
  id: string;
  departmentId: string;
  userEmail: string;
  authUserId?: string | null;
  displayName: string;
  membershipRole: DepartmentMembershipRole;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface ProjectUnitScope {
  [projectId: string]: string[];
}

export interface ReportTreeUnitNode {
  code: string;
  name: string;
  hasData: boolean;
  hasPendingOverwrite: boolean;
}

export interface ReportTreeProjectNode {
  project: Project;
  importedCount: number;
  pendingCount: number;
  units: ReportTreeUnitNode[];
}

export type ExtractCriterionAxis = 'VERTICAL' | 'HORIZONTAL';

export interface ExtractCriterionOption {
  key: string;
  label: string;
  axis: ExtractCriterionAxis;
  templateId: string;
  templateName: string;
  sourceRow?: number;
  valueIndex?: number;
  blockId?: string | null;
}

export interface ExtractReportFieldConfig {
  id: string;
  label: string;
  templateId: string;
  firstAxis: ExtractCriterionAxis;
  firstCriterionKey: string;
  secondAxis: ExtractCriterionAxis;
  secondCriterionKey: string;
}

export interface ExtractReportBlueprint {
  id: string;
  projectId: string;
  name: string;
  description: string;
  fields: ExtractReportFieldConfig[];
  updatedById?: string | null;
  updatedByName?: string | null;
  createdAt: any;
  updatedAt: any;
}

export interface ExtractReportBlueprintVersion {
  id: string;
  blueprintId: string;
  versionNumber: number;
  name: string;
  description: string;
  fields: ExtractReportFieldConfig[];
  createdById?: string | null;
  createdByName?: string | null;
  createdAt: any;
}

export type SubmissionEventType = 'INITIAL_SUBMISSION' | 'APPROVED_OVERWRITE';

export interface ProjectUnitSubmissionEvent {
  id: string;
  projectId: string;
  unitCode: string;
  year: string;
  dataFileId?: string | null;
  eventType: SubmissionEventType;
  submittedAt: any;
  submittedBy?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  approvedAt?: any;
  approvedBy?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  overwriteRequestId?: string | null;
  createdAt: any;
}

export type AppNotificationKind = 'PROJECT_DEADLINE_REMINDER';

export interface AppNotificationRecord {
  id: string;
  notificationKey: string;
  recipientAuthUserId?: string | null;
  recipientEmail: string;
  recipientDisplayName?: string | null;
  kind: AppNotificationKind;
  title: string;
  body: string;
  projectId?: string | null;
  projectName?: string | null;
  unitCode?: string | null;
  year?: string | null;
  dueAt?: any;
  readAt?: any;
  createdAt: any;
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
