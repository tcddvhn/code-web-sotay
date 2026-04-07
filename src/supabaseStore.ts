import { getAssignmentKey } from './access';
import { supabase } from './supabase';
import { AppSettings, AssignmentUser, DataFileRecordSummary, DataRow, FormTemplate, ManagedUnit, OverwriteRequestRecord, Project, UserProfile } from './types';

const SETTINGS_ROW_ID = 'global';
const SUPABASE_PAGE_SIZE = 1000;

type SupabaseProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'COMPLETED';
  created_at: string | null;
  updated_at: string | null;
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

function nowIso() {
  return new Date().toISOString();
}

function mapProject(row: SupabaseProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status,
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
    displayName: row.display_name || row.email,
    role: row.role || 'contributor',
    unitCode: row.unit_code || null,
    unitName: row.unit_name || null,
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

export async function listProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch dÃ¡Â»Â± ÃƒÂ¡n tÃ¡Â»Â« Supabase.');
  }

  return ((data || []) as SupabaseProjectRow[]).map(mapProject);
}

export async function upsertProject(project: Project) {
  const payload = {
    id: project.id,
    name: project.name,
    description: project.description || '',
    status: project.status,
    created_at: typeof project.createdAt === 'string' ? project.createdAt : nowIso(),
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('projects').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u dÃ¡Â»Â± ÃƒÂ¡n lÃƒÂªn Supabase.');
  }
}

export async function deleteProjectById(projectId: string) {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â± ÃƒÂ¡n trÃƒÂªn Supabase.');
  }
}

export async function listTemplates(projectId?: string) {
  let builder = supabase.from('templates').select('*').order('created_at', { ascending: true });
  if (projectId) {
    builder = builder.eq('project_id', projectId);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch biÃ¡Â»Æ’u mÃ¡ÂºÂ«u tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u biÃ¡Â»Æ’u mÃ¡ÂºÂ«u lÃƒÂªn Supabase.');
  }
}

export async function deleteTemplateById(templateId: string) {
  const { error } = await supabase.from('templates').delete().eq('id', templateId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a biÃ¡Â»Æ’u mÃ¡ÂºÂ«u trÃƒÂªn Supabase.');
  }
}

export async function listUnits() {
  const { data, error } = await supabase.from('units').select('*').order('code');
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ khÃ¡Â»Å¸i tÃ¡ÂºÂ¡o danh sÃƒÂ¡ch Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ trÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ lÃƒÂªn Supabase.');
  }
}

export async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', SETTINGS_ROW_ID).maybeSingle();
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i cÃƒÂ i Ã„â€˜Ã¡ÂºÂ·t tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u cÃƒÂ i Ã„â€˜Ã¡ÂºÂ·t lÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch tÃƒÂ i khoÃ¡ÂºÂ£n tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i hÃ¡Â»â€œ sÃ†Â¡ tÃƒÂ i khoÃ¡ÂºÂ£n tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t phiÃƒÂªn Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p ngÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng trÃƒÂªn Supabase.');
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
}) {
  const { error } = await supabase.from('user_profiles').upsert(
    {
      email: getAssignmentKey(profile.email),
      auth_user_id: profile.authUserId || null,
      display_name: profile.displayName,
      role: profile.role,
      unit_code: profile.unitCode || null,
      unit_name: profile.unitName || null,
      is_active: profile.isActive ?? true,
      updated_at: nowIso(),
    },
    { onConflict: 'email' },
  );

  if (error) {
    throw new Error(error.message || 'KhÃ´ng thá»ƒ lÆ°u há»“ sÆ¡ tÃ i khoáº£n lÃªn Supabase.');
  }
}

export async function updateUserProfile(email: string, patch: {
  displayName?: string;
  role?: UserProfile['role'];
  unitCode?: string | null;
  unitName?: string | null;
  isActive?: boolean;
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

  const { error } = await supabase
    .from('user_profiles')
    .update(payload)
    .eq('email', normalizedEmail);

  if (error) {
    throw new Error(error.message || 'Không thể cập nhật hồ sơ tài khoản trên Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i phÃƒÂ¢n cÃƒÂ´ng tÃ¡Â»Â« Supabase.');
  }

  return (data || []) as SupabaseAssignmentRow[];
}

export async function replaceAssignments(projectId: string, entries: SupabaseAssignmentRow[]) {
  const { error: deleteError } = await supabase.from('assignments').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃƒÂ m mÃ¡Â»â€ºi phÃƒÂ¢n cÃƒÂ´ng trÃƒÂªn Supabase.');
  }

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from('assignments').insert(entries);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u phÃƒÂ¢n cÃƒÂ´ng trÃƒÂªn Supabase.');
  }
}

export async function listGlobalAssignments() {
  const { data, error } = await supabase
    .from('global_assignments')
    .select('*');

  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i phÃƒÂ¢n cÃƒÂ´ng toÃƒÂ n hÃ¡Â»â€¡ thÃ¡Â»â€˜ng tÃ¡Â»Â« Supabase.');
  }

  return (data || []) as SupabaseGlobalAssignmentRow[];
}

export async function replaceGlobalAssignments(entries: SupabaseGlobalAssignmentRow[]) {
  const { error: deleteError } = await supabase.from('global_assignments').delete().neq('id', '');
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃƒÂ m mÃ¡Â»â€ºi phÃƒÂ¢n cÃƒÂ´ng toÃƒÂ n hÃ¡Â»â€¡ thÃ¡Â»â€˜ng trÃƒÂªn Supabase.');
  }

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from('global_assignments').insert(entries);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u phÃƒÂ¢n cÃƒÂ´ng toÃƒÂ n hÃ¡Â»â€¡ thÃ¡Â»â€˜ng trÃƒÂªn Supabase.');
  }
}

export async function listRowsByProject(projectId: string) {
  const { count, error: countError } = await supabase
    .from('consolidated_rows')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (countError) {
    throw new Error(countError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ Ã„â€˜Ã¡ÂºÂ¿m dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»â€¢ng hÃ¡Â»Â£p tÃ¡Â»Â« Supabase.');
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
      throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»â€¢ng hÃ¡Â»Â£p tÃ¡Â»Â« Supabase.');
    }

    const pageRows = (data || []) as any[];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  if (rows.length < expectedCount) {
    throw new Error(`Chi tai duoc ${rows.length}/${expectedCount} dong du lieu tong hop tu Supabase.`);
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
}) {
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
    throw new Error(countError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ Ã„â€˜Ã¡ÂºÂ¿m dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»â€¢ng hÃ¡Â»Â£p theo phÃ¡ÂºÂ¡m vi trÃƒÂªn Supabase.');
  }

  const expectedCount = count || 0;
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
      throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»â€¢ng hÃ¡Â»Â£p theo phÃ¡ÂºÂ¡m vi tÃ¡Â»Â« Supabase.');
    }

    const pageRows = (data || []) as any[];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  if (rows.length < expectedCount) {
    throw new Error(`Chi tai duoc ${rows.length}/${expectedCount} dong du lieu tong hop theo pham vi tu Supabase.`);
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»â€¢ng hÃ¡Â»Â£p lÃƒÂªn Supabase.');
  }
}

export async function countRowsByYear(projectId: string, year: string) {
  const { count, error } = await supabase
    .from('consolidated_rows')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('year', year);

  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ Ã„â€˜Ã¡ÂºÂ¿m dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m trÃƒÂªn Supabase.');
  }

  return count || 0;
}

export async function deleteRowsByProject(projectId: string) {
  const { error } = await supabase.from('consolidated_rows').delete().eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u dÃ¡Â»Â± ÃƒÂ¡n trÃƒÂªn Supabase.');
  }
}

export async function deleteRowsByTemplate(templateId: string) {
  const { error } = await supabase.from('consolidated_rows').delete().eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u biÃ¡Â»Æ’u mÃ¡ÂºÂ«u trÃƒÂªn Supabase.');
  }
}

export async function deleteRowsByYear(projectId: string, year: string) {
  const { error } = await supabase
    .from('consolidated_rows')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m trÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ trÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u metadata file dÃ¡Â»Â¯ liÃ¡Â»â€¡u lÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'Không thể tải danh sách yêu cầu ghi đè dữ liệu từ Supabase.');
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
    throw new Error(error.message || 'Không thể tạo yêu cầu ghi đè dữ liệu trên Supabase.');
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
    throw new Error(error.message || 'Không thể cập nhật quyết định phê duyệt ghi đè trên Supabase.');
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
    throw new Error(error.message || 'Kh?ng th? c?p nh?t tr?ng th?i ?? xem cho th?ng b?o ghi ??.');
  }
}

export async function getDataFileRecord(projectId: string, unitCode: string, year: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('*')
    .eq('id', `${projectId}_${unitCode}_${year}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i metadata file dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch file dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i danh sÃƒÂ¡ch file dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo phÃ¡ÂºÂ¡m vi tÃ¡Â»Â« Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ Ã„â€˜Ã¡ÂºÂ¿m metadata file theo nÃ„Æ’m trÃƒÂªn Supabase.');
  }

  return count || 0;
}

export async function deleteDataFilesByProject(projectId: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('storage_path')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i metadata file cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n trÃƒÂªn Supabase.');
  }

  const { error: deleteError } = await supabase.from('data_files').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a metadata file cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n trÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i metadata file theo nÃ„Æ’m trÃƒÂªn Supabase.');
  }

  const { error: deleteError } = await supabase
    .from('data_files')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a metadata file theo nÃ„Æ’m trÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i metadata file cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ trÃƒÂªn Supabase.');
  }

  const { error: deleteError } = await supabase
    .from('data_files')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('unit_code', unitCode);
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a metadata file cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ trÃƒÂªn Supabase.');
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
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ lÃ†Â°u lÃ¡Â»â€¹ch sÃ¡Â»Â­ xuÃ¡ÂºÂ¥t bÃƒÂ¡o cÃƒÂ¡o lÃƒÂªn Supabase.');
  }
}

export async function deleteReportExportsByProject(projectId: string) {
  const { data, error } = await supabase
    .from('report_exports')
    .select('storage_path')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i lÃ¡Â»â€¹ch sÃ¡Â»Â­ xuÃ¡ÂºÂ¥t bÃƒÂ¡o cÃƒÂ¡o cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n.');
  }

  const { error: deleteError } = await supabase.from('report_exports').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a lÃ¡Â»â€¹ch sÃ¡Â»Â­ xuÃ¡ÂºÂ¥t bÃƒÂ¡o cÃƒÂ¡o cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export async function deleteReportExportsByTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('report_exports')
    .select('storage_path')
    .eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i lÃ¡Â»â€¹ch sÃ¡Â»Â­ xuÃ¡ÂºÂ¥t bÃƒÂ¡o cÃƒÂ¡o cÃ¡Â»Â§a biÃ¡Â»Æ’u mÃ¡ÂºÂ«u.');
  }

  const { error: deleteError } = await supabase.from('report_exports').delete().eq('template_id', templateId);
  if (deleteError) {
    throw new Error(deleteError.message || 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a lÃ¡Â»â€¹ch sÃ¡Â»Â­ xuÃ¡ÂºÂ¥t bÃƒÂ¡o cÃƒÂ¡o cÃ¡Â»Â§a biÃ¡Â»Æ’u mÃ¡ÂºÂ«u.');
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
