import { getAssignmentKey } from './access';
import { getReadableDisplayName, repairLegacyUtf8 } from './utils/textEncoding';
import { supabase } from './supabase';
import {
  AppSettings,
  AssignmentUser,
  DataFileRecordSummary,
  DataRow,
  Department,
  DepartmentMember,
  ExtractReportBlueprint,
  ExtractReportBlueprintVersion,
  FormTemplate,
  ManagedUnit,
  OverwriteRequestRecord,
  Project,
  ProjectUnitScope,
  UserProfile,
} from './types';

const SETTINGS_ROW_ID = 'global';
const SUPABASE_PAGE_SIZE = 1000;

type SupabaseProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'COMPLETED';
  owner_department_id: string | null;
  created_by_email: string | null;
  created_by_auth_user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseDepartmentRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseDepartmentMemberRow = {
  id: string;
  department_id: string;
  user_email: string;
  auth_user_id: string | null;
  display_name: string;
  membership_role: 'manager' | 'member';
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseProjectUnitRow = {
  project_id: string;
  unit_code: string;
};

type SupabaseTemplateRow = {
  id: string;
  project_id: string;
  name: string;
  sheet_name: string;
  is_published: boolean | null;
  column_headers: string[] | null;
  column_mapping: FormTemplate['columnMapping'];
  header_layout: FormTemplate['headerLayout'] | null;
  mode: FormTemplate['mode'];
  legacy_config_name: string | null;
  source_workbook_name: string | null;
  source_workbook_path: string | null;
  source_workbook_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseUnitRow = {
  code: string;
  name: string;
  is_deleted: boolean | null;
  deleted_at: string | null;
  deleted_by: ManagedUnit['deletedBy'] | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseAssignmentRow = {
  id: string;
  project_id: string;
  assignee_key: string;
  user_id: string | null;
  email: string;
  display_name: string;
  unit_codes: string[] | null;
  updated_at: string | null;
};

type SupabaseGlobalAssignmentRow = {
  id: string;
  assignee_key: string;
  user_id: string | null;
  email: string;
  display_name: string;
  unit_codes: string[] | null;
  updated_at: string | null;
};

type SupabaseUserProfileRow = {
  email: string;
  auth_user_id: string | null;
  display_name: string;
  role: 'admin' | 'contributor' | 'unit_user';
  unit_code: string | null;
  unit_name: string | null;
  is_active: boolean | null;
  must_change_password: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
};

type SupabaseOverwriteRequestRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  unit_code: string;
  unit_name: string;
  year: string;
  file_name: string;
  storage_path: string;
  download_url: string | null;
  row_payload: DataRow[] | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_by: OverwriteRequestRecord['requestedBy'];
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: OverwriteRequestRecord['reviewedBy'];
  requester_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseDataFileRow = {
  id: string;
  project_id: string;
  unit_code: string;
  unit_name: string | null;
  year: string;
  file_name: string;
  storage_path: string;
  download_url: string | null;
  submitted_at: string | null;
  submitted_by: DataFileRecordSummary['submittedBy'] | null;
  updated_at: string | null;
};

type SupabaseReportExportRow = {
  id?: string;
  project_id: string;
  template_id: string;
  template_name: string;
  unit_code: string;
  unit_name: string;
  year: string;
  file_name: string;
  storage_path: string;
  download_url: string;
  created_at?: string | null;
  created_by: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
};

type SupabaseExtractReportBlueprintRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  fields: ExtractReportBlueprint['fields'] | null;
  updated_by_id: string | null;
  updated_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseExtractReportBlueprintVersionRow = {
  id: string;
  blueprint_id: string;
  version_number: number;
  name: string;
  description: string | null;
  fields: ExtractReportBlueprint['fields'] | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function mapProject(row: SupabaseProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status,
    ownerDepartmentId: row.owner_department_id || null,
    createdByEmail: row.created_by_email || null,
    createdByAuthUserId: row.created_by_auth_user_id || null,
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
  };
}

function mapDepartment(row: SupabaseDepartmentRow): Department {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active ?? true,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
  };
}

function mapDepartmentMember(row: SupabaseDepartmentMemberRow): DepartmentMember {
  return {
    id: row.id,
    departmentId: row.department_id,
    userEmail: row.user_email,
    authUserId: row.auth_user_id || null,
    displayName: getReadableDisplayName(row.display_name, row.user_email),
    membershipRole: row.membership_role,
    isActive: row.is_active ?? true,
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
  };
}

function mapTemplate(row: SupabaseTemplateRow): FormTemplate {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sheetName: row.sheet_name,
    isPublished: row.is_published ?? false,
    columnHeaders: row.column_headers || [],
    columnMapping: row.column_mapping,
    headerLayout: row.header_layout || undefined,
    mode: row.mode,
    legacyConfigName: row.legacy_config_name || undefined,
    sourceWorkbookName: row.source_workbook_name || undefined,
    sourceWorkbookPath: row.source_workbook_path || undefined,
    sourceWorkbookUrl: row.source_workbook_url || undefined,
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
  };
}

function mapUnit(row: SupabaseUnitRow): ManagedUnit {
  return {
    code: row.code,
    name: row.name,
    isDeleted: row.is_deleted ?? false,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToPayload(row: DataRow) {
  return {
    project_id: row.projectId,
    template_id: row.templateId,
    unit_code: row.unitCode,
    year: row.year,
    source_row: row.sourceRow,
    label: row.label,
    values: row.values,
    updated_at: nowIso(),
    updated_by: row.updatedBy || null,
  };
}

function mapUserProfile(row: SupabaseUserProfileRow): UserProfile {
  return {
    id: row.auth_user_id || getAssignmentKey(row.email),
    email: row.email,
    displayName: getReadableDisplayName(row.display_name, row.email),
    role: row.role || 'contributor',
    authUserId: row.auth_user_id || null,
    mustChangePassword: row.must_change_password ?? false,
    unitCode: row.unit_code || null,
    unitName: repairLegacyUtf8(row.unit_name || null) || null,
  };
}

function mapOverwriteRequest(row: SupabaseOverwriteRequestRow): OverwriteRequestRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name || null,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    year: row.year,
    fileName: row.file_name,
    storagePath: row.storage_path,
    downloadURL: row.download_url,
    rowPayload: Array.isArray(row.row_payload) ? row.row_payload : [],
    status: row.status,
    requestedBy: row.requested_by || null,
    reviewNote: row.review_note || null,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by || null,
    requesterSeenAt: row.requester_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExtractReportBlueprint(row: SupabaseExtractReportBlueprintRow): ExtractReportBlueprint {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description || '',
    fields: Array.isArray(row.fields) ? row.fields : [],
    updatedById: row.updated_by_id || null,
    updatedByName: repairLegacyUtf8(row.updated_by_name || null) || null,
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
  };
}

function mapExtractReportBlueprintVersion(
  row: SupabaseExtractReportBlueprintVersionRow,
): ExtractReportBlueprintVersion {
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    versionNumber: row.version_number,
    name: row.name,
    description: row.description || '',
    fields: Array.isArray(row.fields) ? row.fields : [],
    createdById: row.created_by_id || null,
    createdByName: repairLegacyUtf8(row.created_by_name || null) || null,
    createdAt: row.created_at || nowIso(),
  };
}

export async function listProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseProjectRow[]).map(mapProject);
}

export async function upsertProject(project: Project) {
  const payload = {
    id: project.id,
    name: project.name,
    description: project.description || '',
    status: project.status,
    owner_department_id: project.ownerDepartmentId || null,
    created_by_email: project.createdByEmail || null,
    created_by_auth_user_id: project.createdByAuthUserId || null,
    created_at: typeof project.createdAt === 'string' ? project.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('projects').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}


export async function listDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message?.includes("Could not find the table 'public.departments'")) {
      return [] satisfies Department[];
    }
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseDepartmentRow[]).map(mapDepartment);
}

export async function upsertDepartment(department: Department) {
  const payload = {
    id: department.id,
    code: department.code,
    name: department.name,
    is_active: department.isActive,
    sort_order: department.sortOrder,
    created_at: typeof department.createdAt === 'string' ? department.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('departments').upsert(payload, { onConflict: 'id' });
  if (error) {
    if (error.message?.includes("Could not find the table 'public.departments'")) {
      throw new Error('Bảng departments chưa được khởi tạo. Hãy chạy file supabase/departments_rollout.sql trước.');
    }
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listDepartmentMembers() {
  const { data, error } = await supabase
    .from('department_members')
    .select('*')
    .order('department_id', { ascending: true })
    .order('membership_role', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    if (error.message?.includes("Could not find the table 'public.department_members'")) {
      return [] satisfies DepartmentMember[];
    }
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseDepartmentMemberRow[]).map(mapDepartmentMember);
}

export async function upsertDepartmentMember(member: DepartmentMember) {
  const payload = {
    id: member.id,
    department_id: member.departmentId,
    user_email: member.userEmail,
    auth_user_id: member.authUserId || null,
    display_name: member.displayName,
    membership_role: member.membershipRole,
    is_active: member.isActive,
    created_at: typeof member.createdAt === 'string' ? member.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('department_members').upsert(payload, { onConflict: 'id' });
  if (error) {
    if (error.message?.includes("Could not find the table 'public.department_members'")) {
      throw new Error('Bảng department_members chưa được khởi tạo. Hãy chạy file supabase/departments_rollout.sql trước.');
    }
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deactivateDepartmentMember(memberId: string) {
  const { error } = await supabase
    .from('department_members')
    .update({ is_active: false, updated_at: nowIso() })
    .eq('id', memberId);

  if (error) {
    if (error.message?.includes("Could not find the table 'public.department_members'")) {
      throw new Error('Bảng department_members chưa được khởi tạo. Hãy chạy file supabase/departments_rollout.sql trước.');
    }
    throw new Error(error.message || 'Supabase request failed.');
  }
}
export async function listProjectUnitScope() {
  const { data, error } = await supabase
    .from('project_units')
    .select('project_id, unit_code')
    .order('project_id', { ascending: true })
    .order('unit_code', { ascending: true });

  if (error) {
    if (error.message?.includes("Could not find the table 'public.project_units'")) {
      return {} satisfies ProjectUnitScope;
    }
    throw new Error(error.message || 'Supabase request failed.');
  }

  const scope: ProjectUnitScope = {};
  ((data || []) as SupabaseProjectUnitRow[]).forEach((row) => {
    if (!scope[row.project_id]) {
      scope[row.project_id] = [];
    }
    scope[row.project_id].push(row.unit_code);
  });

  return scope;
}

export async function replaceProjectUnits(projectId: string, unitCodes: string[]) {
  const { error: deleteError } = await supabase.from('project_units').delete().eq('project_id', projectId);
  if (deleteError) {
    if (deleteError.message?.includes("Could not find the table 'public.project_units'")) {
      throw new Error('Bảng project_units chưa được khởi tạo. Hãy chạy file supabase/project_units_rollout.sql trước.');
    }
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  if (unitCodes.length === 0) {
    return;
  }

  const payload = unitCodes.map((unitCode) => ({
    project_id: projectId,
    unit_code: unitCode,
  }));

  const { error } = await supabase.from('project_units').insert(payload);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteProjectById(projectId: string) {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listTemplates(projectId?: string) {
  let builder = supabase.from('templates').select('*').order('created_at', { ascending: true });
  if (projectId) {
    builder = builder.eq('project_id', projectId);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseTemplateRow[]).map(mapTemplate);
}

export async function upsertTemplate(template: FormTemplate) {
  const payload = {
    id: template.id,
    project_id: template.projectId,
    name: template.name,
    sheet_name: template.sheetName,
    is_published: template.isPublished ?? false,
    column_headers: template.columnHeaders || [],
    column_mapping: template.columnMapping,
    header_layout: template.headerLayout || null,
    mode: template.mode,
    legacy_config_name: template.legacyConfigName || null,
    source_workbook_name: template.sourceWorkbookName || null,
    source_workbook_path: template.sourceWorkbookPath || null,
    source_workbook_url: template.sourceWorkbookUrl || null,
    created_at: typeof template.createdAt === 'string' ? template.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('templates').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteTemplateById(templateId: string) {
  const { error } = await supabase.from('templates').delete().eq('id', templateId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listExtractReportBlueprints(projectId?: string) {
  let builder = supabase
    .from('extract_report_blueprints')
    .select('*')
    .order('updated_at', { ascending: false });

  if (projectId) {
    builder = builder.eq('project_id', projectId);
  }

  const { data, error } = await builder;
  if (error) {
    if (error.message?.includes("Could not find the table 'public.extract_report_blueprints'")) {
      return [] as ExtractReportBlueprint[];
    }
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseExtractReportBlueprintRow[]).map(mapExtractReportBlueprint);
}

export async function upsertExtractReportBlueprint(blueprint: ExtractReportBlueprint) {
  const payload = {
    id: blueprint.id,
    project_id: blueprint.projectId,
    name: blueprint.name,
    description: blueprint.description || '',
    fields: blueprint.fields,
    updated_by_id: blueprint.updatedById || null,
    updated_by_name: repairLegacyUtf8(blueprint.updatedByName || null) || null,
    created_at: typeof blueprint.createdAt === 'string' ? blueprint.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase
    .from('extract_report_blueprints')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    if (error.message?.includes("Could not find the table 'public.extract_report_blueprints'")) {
      throw new Error('Bảng extract_report_blueprints chưa được khởi tạo. Hãy chạy file supabase/extract_reports_rollout.sql trước.');
    }
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listExtractReportBlueprintVersions(blueprintId: string) {
  const { data, error } = await supabase
    .from('extract_report_blueprint_versions')
    .select('*')
    .eq('blueprint_id', blueprintId)
    .order('version_number', { ascending: false });

  if (error) {
    if (error.message?.includes("Could not find the table 'public.extract_report_blueprint_versions'")) {
      return [] as ExtractReportBlueprintVersion[];
    }
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseExtractReportBlueprintVersionRow[]).map(mapExtractReportBlueprintVersion);
}

export async function appendExtractReportBlueprintVersion(version: ExtractReportBlueprintVersion) {
  const payload = {
    id: version.id,
    blueprint_id: version.blueprintId,
    version_number: version.versionNumber,
    name: version.name,
    description: version.description || '',
    fields: version.fields,
    created_by_id: version.createdById || null,
    created_by_name: repairLegacyUtf8(version.createdByName || null) || null,
    created_at: typeof version.createdAt === 'string' ? version.createdAt : nowIso(),
  };

  const { error } = await supabase.from('extract_report_blueprint_versions').insert(payload);
  if (error) {
    if (error.message?.includes("Could not find the table 'public.extract_report_blueprint_versions'")) {
      throw new Error(
        'Bảng extract_report_blueprint_versions chưa được khởi tạo. Hãy chạy file supabase/extract_reports_rollout.sql trước.',
      );
    }
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteExtractReportBlueprint(blueprintId: string) {
  const { error } = await supabase.from('extract_report_blueprints').delete().eq('id', blueprintId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listUnits() {
  const { data, error } = await supabase.from('units').select('*').order('code');
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseUnitRow[]).map(mapUnit);
}

export async function seedUnits(units: ManagedUnit[]) {
  const payload = units.map((unit) => ({
    code: unit.code,
    name: unit.name,
    is_deleted: unit.isDeleted ?? false,
    deleted_at: unit.deletedAt || null,
    deleted_by: unit.deletedBy || null,
    created_at: typeof unit.createdAt === 'string' ? unit.createdAt : nowIso(),
    updated_at: typeof unit.updatedAt === 'string' ? unit.updatedAt : nowIso(),
  }));

  const { error } = await supabase.from('units').upsert(payload, { onConflict: 'code' });
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function upsertUnit(unit: ManagedUnit) {
  const payload = {
    code: unit.code,
    name: unit.name,
    is_deleted: unit.isDeleted ?? false,
    deleted_at: unit.deletedAt || null,
    deleted_by: unit.deletedBy || null,
    created_at: typeof unit.createdAt === 'string' ? unit.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('units').upsert(payload, { onConflict: 'code' });
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', SETTINGS_ROW_ID).maybeSingle();
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  if (!data) {
    return null;
  }

  return {
    oneDriveLink: data.one_drive_link || '',
    storagePath: data.storage_path || '',
    receivedPath: data.received_path || '',
  } satisfies AppSettings;
}

export async function upsertSettings(settings: AppSettings) {
  const { error } = await supabase.from('app_settings').upsert(
    {
      id: SETTINGS_ROW_ID,
      one_drive_link: settings.oneDriveLink,
      storage_path: settings.storagePath,
      received_path: settings.receivedPath,
      updated_at: nowIso(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listUserProfiles() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseUserProfileRow[]).map(mapUserProfile);
}

export async function getUserProfileByEmail(email?: string | null) {
  const normalizedEmail = getAssignmentKey(email);
  if (!normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', normalizedEmail)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  if (!data) {
    return null;
  }

  return mapUserProfile(data as SupabaseUserProfileRow);
}

export async function touchUserProfileSession(email: string, authUserId: string) {
  const normalizedEmail = getAssignmentKey(email);
  if (!normalizedEmail || !authUserId) {
    return;
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({
      auth_user_id: authUserId,
      last_login_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('email', normalizedEmail);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function upsertUserProfile(profile: {
  email: string;
  authUserId?: string | null;
  displayName: string;
  role: UserProfile['role'];
  unitCode?: string | null;
  unitName?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
}) {
  const payload: Record<string, unknown> = {
    email: getAssignmentKey(profile.email),
    display_name: profile.displayName,
    role: profile.role,
    unit_code: profile.unitCode || null,
    unit_name: profile.unitName || null,
    is_active: profile.isActive ?? true,
    updated_at: nowIso(),
  };

  if (profile.authUserId !== undefined) {
    payload.auth_user_id = profile.authUserId || null;
  }

  if (profile.mustChangePassword !== undefined) {
    payload.must_change_password = profile.mustChangePassword;
  }

  const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'email' });

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function updateUserProfile(email: string, patch: {
  displayName?: string;
  role?: UserProfile['role'];
  unitCode?: string | null;
  unitName?: string | null;
  isActive?: boolean;
  authUserId?: string | null;
  mustChangePassword?: boolean;
}) {
  const normalizedEmail = getAssignmentKey(email);
  if (!normalizedEmail) {
    throw new Error('Email tài khoản không hợp lệ.');
  }

  const payload: Record<string, any> = {
    updated_at: nowIso(),
  };

  if (patch.displayName !== undefined) payload.display_name = patch.displayName;
  if (patch.role !== undefined) payload.role = patch.role;
  if (patch.unitCode !== undefined) payload.unit_code = patch.unitCode || null;
  if (patch.unitName !== undefined) payload.unit_name = patch.unitName || null;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  if (patch.authUserId !== undefined) payload.auth_user_id = patch.authUserId || null;
  if (patch.mustChangePassword !== undefined) payload.must_change_password = patch.mustChangePassword;

  const { error } = await supabase
    .from('user_profiles')
    .update(payload)
    .eq('email', normalizedEmail);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deactivateUserProfile(email: string) {
  await updateUserProfile(email, { isActive: false });
}
export async function listAssignments(projectId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return (data || []) as SupabaseAssignmentRow[];
}

export async function replaceAssignments(projectId: string, entries: SupabaseAssignmentRow[]) {
  const { error: deleteError } = await supabase.from('assignments').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from('assignments').insert(entries);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listGlobalAssignments() {
  const { data, error } = await supabase
    .from('global_assignments')
    .select('*');

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return (data || []) as SupabaseGlobalAssignmentRow[];
}

export async function replaceGlobalAssignments(entries: SupabaseGlobalAssignmentRow[]) {
  const { error: deleteError } = await supabase.from('global_assignments').delete().neq('id', '');
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from('global_assignments').insert(entries);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listRowsByProject(projectId: string) {
  const { count, error: countError } = await supabase
    .from('consolidated_rows')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (countError) {
    throw new Error(countError.message || 'Supabase request failed.');
  }

  const expectedCount = count || 0;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('consolidated_rows')
      .select('*')
      .eq('project_id', projectId)
      .order('template_id', { ascending: true })
      .order('year', { ascending: true })
      .order('source_row', { ascending: true })
      .order('unit_code', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message || 'Supabase request failed.');
    }

    const pageRows = (data || []) as any[];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  if (rows.length < expectedCount) {
    throw new Error(`Chỉ tải được ${rows.length}/${expectedCount} dòng dữ liệu tổng hợp từ Supabase.`);
  }

  return rows.map((row) => ({
    projectId: row.project_id,
    templateId: row.template_id,
    unitCode: row.unit_code,
    year: row.year,
    sourceRow: row.source_row,
    label: row.label,
    values: Array.isArray(row.values) ? row.values.map((value: number) => Number(value) || 0) : [],
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || undefined,
  })) as DataRow[];
}

export async function listRowsByScope(params: {
  projectId: string;
  years?: string[];
  templateIds?: string[];
  unitCodes?: string[];
  skipExactCount?: boolean;
}) {
  let expectedCount: number | null = null;

  if (!params.skipExactCount) {
    let countBuilder = supabase
      .from('consolidated_rows')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', params.projectId);

    if (params.years && params.years.length > 0) {
      countBuilder = countBuilder.in('year', params.years);
    }
    if (params.templateIds && params.templateIds.length > 0) {
      countBuilder = countBuilder.in('template_id', params.templateIds);
    }
    if (params.unitCodes && params.unitCodes.length > 0) {
      countBuilder = countBuilder.in('unit_code', params.unitCodes);
    }

    const { count, error: countError } = await countBuilder;

    if (countError) {
      throw new Error(countError.message || 'Supabase request failed.');
    }

    expectedCount = count || 0;
  }

  const rows: any[] = [];
  let from = 0;

  while (true) {
    let pageBuilder = supabase
      .from('consolidated_rows')
      .select('*')
      .eq('project_id', params.projectId)
      .order('template_id', { ascending: true })
      .order('year', { ascending: true })
      .order('source_row', { ascending: true })
      .order('unit_code', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (params.years && params.years.length > 0) {
      pageBuilder = pageBuilder.in('year', params.years);
    }
    if (params.templateIds && params.templateIds.length > 0) {
      pageBuilder = pageBuilder.in('template_id', params.templateIds);
    }
    if (params.unitCodes && params.unitCodes.length > 0) {
      pageBuilder = pageBuilder.in('unit_code', params.unitCodes);
    }

    const { data, error } = await pageBuilder;

    if (error) {
      throw new Error(error.message || 'Supabase request failed.');
    }

    const pageRows = (data || []) as any[];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  if (expectedCount !== null && rows.length < expectedCount) {
    throw new Error(`Chỉ tải được ${rows.length}/${expectedCount} dòng dữ liệu tổng hợp theo phạm vi từ Supabase.`);
  }

  return rows.map((row) => ({
    projectId: row.project_id,
    templateId: row.template_id,
    unitCode: row.unit_code,
    year: row.year,
    sourceRow: row.source_row,
    label: row.label,
    values: Array.isArray(row.values) ? row.values.map((value: number) => Number(value) || 0) : [],
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || undefined,
  })) as DataRow[];
}

export async function upsertRows(rows: DataRow[]) {
  if (rows.length === 0) {
    return;
  }

  const payload = rows.map((row) => ({
    ...mapRowToPayload(row),
    id: `${row.projectId}_${row.templateId}_${row.unitCode}_${row.year}_${row.sourceRow}`,
  }));

  const { error } = await supabase.from('consolidated_rows').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function countRowsByYear(projectId: string, year: string) {
  const { count, error } = await supabase
    .from('consolidated_rows')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('year', year);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return count || 0;
}

export async function deleteRowsByProject(projectId: string) {
  const { error } = await supabase.from('consolidated_rows').delete().eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteRowsByTemplate(templateId: string) {
  const { error } = await supabase.from('consolidated_rows').delete().eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteRowsByYear(projectId: string, year: string) {
  const { error } = await supabase
    .from('consolidated_rows')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteRowsByUnit(projectId: string, year: string, unitCode: string) {
  const { error } = await supabase
    .from('consolidated_rows')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('unit_code', unitCode);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function upsertDataFileRecord(record: {
  projectId: string;
  unitCode: string;
  unitName: string;
  year: string;
  fileName: string;
  storagePath: string;
  downloadURL: string;
  submittedAt?: string | null;
  submittedBy?: DataFileRecordSummary['submittedBy'];
}) {
  const payload = {
    id: `${record.projectId}_${record.unitCode}_${record.year}`,
    project_id: record.projectId,
    unit_code: record.unitCode,
    unit_name: record.unitName,
    year: record.year,
    file_name: record.fileName,
    storage_path: record.storagePath,
    download_url: record.downloadURL,
    submitted_at: record.submittedAt || nowIso(),
    submitted_by: record.submittedBy || null,
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('data_files').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function listOverwriteRequests(projectId?: string): Promise<OverwriteRequestRecord[]> {
  let builder = supabase
    .from('data_overwrite_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (projectId) {
    builder = builder.eq('project_id', projectId);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseOverwriteRequestRow[]).map(mapOverwriteRequest);
}

export async function createOverwriteRequest(record: Omit<OverwriteRequestRecord, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'reviewedAt' | 'reviewedBy' | 'requesterSeenAt'>) {
  const payload = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${record.projectId}_${record.unitCode}_${record.year}_${Date.now()}`,
    project_id: record.projectId,
    project_name: record.projectName || null,
    unit_code: record.unitCode,
    unit_name: record.unitName,
    year: record.year,
    file_name: record.fileName,
    storage_path: record.storagePath,
    download_url: record.downloadURL || null,
    row_payload: record.rowPayload,
    status: 'PENDING',
    requested_by: record.requestedBy || null,
    review_note: record.reviewNote || null,
    reviewed_at: null,
    reviewed_by: null,
    requester_seen_at: null,
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('data_overwrite_requests').insert(payload);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function updateOverwriteRequestDecision(params: {
  requestId: string;
  status: 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  reviewedBy?: OverwriteRequestRecord['reviewedBy'];
}) {
  const { error } = await supabase
    .from('data_overwrite_requests')
    .update({
      status: params.status,
      review_note: params.reviewNote || null,
      reviewed_at: nowIso(),
      reviewed_by: params.reviewedBy || null,
      requester_seen_at: null,
      updated_at: nowIso(),
    })
    .eq('id', params.requestId);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}
export async function markOverwriteRequestsSeen(requestIds: string[]) {
  if (requestIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('data_overwrite_requests')
    .update({
      requester_seen_at: nowIso(),
      updated_at: nowIso(),
    })
    .in('id', requestIds);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function getDataFileRecord(projectId: string, unitCode: string, year: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('*')
    .eq('id', `${projectId}_${unitCode}_${year}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return (data as SupabaseDataFileRow | null) || null;
}

export async function listDataFilesByProject(projectId: string): Promise<DataFileRecordSummary[]> {
  const { data, error } = await supabase
    .from('data_files')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseDataFileRow[]).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    year: row.year,
    fileName: row.file_name,
    storagePath: row.storage_path,
    downloadURL: row.download_url,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    updatedAt: row.updated_at,
  }));
}

export async function listDataFilesByScope(params: {
  projectId: string;
  years?: string[];
  unitCodes?: string[];
}): Promise<DataFileRecordSummary[]> {
  let builder = supabase
    .from('data_files')
    .select('*')
    .eq('project_id', params.projectId)
    .order('updated_at', { ascending: false });

  if (params.years && params.years.length > 0) {
    builder = builder.in('year', params.years);
  }
  if (params.unitCodes && params.unitCodes.length > 0) {
    builder = builder.in('unit_code', params.unitCodes);
  }

  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return ((data || []) as SupabaseDataFileRow[]).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    year: row.year,
    fileName: row.file_name,
    storagePath: row.storage_path,
    downloadURL: row.download_url,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    updatedAt: row.updated_at,
  }));
}

export async function countDataFilesByYear(projectId: string, year: string) {
  const { count, error } = await supabase
    .from('data_files')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('year', year);

  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  return count || 0;
}

export async function deleteDataFilesByProject(projectId: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('storage_path')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  const { error: deleteError } = await supabase.from('data_files').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export async function deleteDataFilesByYear(projectId: string, year: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('storage_path')
    .eq('project_id', projectId)
    .eq('year', year);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  const { error: deleteError } = await supabase
    .from('data_files')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export async function deleteDataFileByUnit(projectId: string, year: string, unitCode: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('storage_path')
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('unit_code', unitCode);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  const { error: deleteError } = await supabase
    .from('data_files')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('unit_code', unitCode);
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export async function deleteDataFilesByTemplate(_templateId: string) {
  return;
}

export async function createReportExport(record: SupabaseReportExportRow) {
  const payload = {
    project_id: record.project_id,
    template_id: record.template_id,
    template_name: record.template_name,
    unit_code: record.unit_code,
    unit_name: record.unit_name,
    year: record.year,
    file_name: record.file_name,
    storage_path: record.storage_path,
    download_url: record.download_url,
    created_at: nowIso(),
    created_by: record.created_by,
  };

  const { error } = await supabase.from('report_exports').insert(payload);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }
}

export async function deleteReportExportsByProject(projectId: string) {
  const { data, error } = await supabase
    .from('report_exports')
    .select('storage_path')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  const { error: deleteError } = await supabase.from('report_exports').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export async function deleteReportExportsByTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('report_exports')
    .select('storage_path')
    .eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'Supabase request failed.');
  }

  const { error: deleteError } = await supabase.from('report_exports').delete().eq('template_id', templateId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Supabase request failed.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export function buildAssignmentRows(projectId: string, users: AssignmentUser[], current: Record<string, string[]>) {
  return Object.entries(current)
    .filter(([, unitCodes]) => unitCodes.length > 0)
    .map(([assigneeKey, unitCodes]) => {
      const assignmentUser = users.find((item) => item.id === assigneeKey);
      return {
        id: `${projectId}_${assigneeKey}`,
        project_id: projectId,
        assignee_key: assigneeKey,
        user_id: assignmentUser?.userId || null,
        email: assignmentUser?.email || assigneeKey,
        display_name: assignmentUser?.displayName || assigneeKey,
        unit_codes: unitCodes,
        updated_at: nowIso(),
      } satisfies SupabaseAssignmentRow;
    });
}

export function buildGlobalAssignmentRows(users: AssignmentUser[], current: Record<string, string[]>) {
  return Object.entries(current)
    .filter(([, unitCodes]) => unitCodes.length > 0)
    .map(([assigneeKey, unitCodes]) => {
      const assignmentUser = users.find((item) => item.id === assigneeKey);
      return {
        id: assigneeKey,
        assignee_key: assigneeKey,
        user_id: assignmentUser?.userId || null,
        email: assignmentUser?.email || assigneeKey,
        display_name: assignmentUser?.displayName || assigneeKey,
        unit_codes: unitCodes,
        updated_at: nowIso(),
      } satisfies SupabaseGlobalAssignmentRow;
    });
}
