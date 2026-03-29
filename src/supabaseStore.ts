import { getAssignmentKey } from './access';
import { supabase } from './supabase';
import { AppSettings, AssignmentUser, DataFileRecordSummary, DataRow, FormTemplate, ManagedUnit, Project, UserProfile } from './types';

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
  role: 'admin' | 'contributor';
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
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
  };
}

export async function listProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Không thể tải danh sách dự án từ Supabase.');
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
    throw new Error(error.message || 'Không thể lưu dự án lên Supabase.');
  }
}

export async function deleteProjectById(projectId: string) {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dự án trên Supabase.');
  }
}

export async function listTemplates(projectId?: string) {
  let builder = supabase.from('templates').select('*').order('created_at', { ascending: true });
  if (projectId) {
    builder = builder.eq('project_id', projectId);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message || 'Không thể tải danh sách biểu mẫu từ Supabase.');
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
    throw new Error(error.message || 'Không thể lưu biểu mẫu lên Supabase.');
  }
}

export async function deleteTemplateById(templateId: string) {
  const { error } = await supabase.from('templates').delete().eq('id', templateId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa biểu mẫu trên Supabase.');
  }
}

export async function listUnits() {
  const { data, error } = await supabase.from('units').select('*').order('code');
  if (error) {
    throw new Error(error.message || 'Không thể tải danh sách đơn vị từ Supabase.');
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
    throw new Error(error.message || 'Không thể khởi tạo danh sách đơn vị trên Supabase.');
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
    throw new Error(error.message || 'Không thể lưu đơn vị lên Supabase.');
  }
}

export async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', SETTINGS_ROW_ID).maybeSingle();
  if (error) {
    throw new Error(error.message || 'Không thể tải cài đặt từ Supabase.');
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
    throw new Error(error.message || 'Không thể lưu cài đặt lên Supabase.');
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
    throw new Error(error.message || 'Không thể tải danh sách tài khoản từ Supabase.');
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
    throw new Error(error.message || 'Không thể tải hồ sơ tài khoản từ Supabase.');
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
    throw new Error(error.message || 'Không thể cập nhật phiên đăng nhập người dùng trên Supabase.');
  }
}

export async function listAssignments(projectId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    throw new Error(error.message || 'Không thể tải phân công từ Supabase.');
  }

  return (data || []) as SupabaseAssignmentRow[];
}

export async function replaceAssignments(projectId: string, entries: SupabaseAssignmentRow[]) {
  const { error: deleteError } = await supabase.from('assignments').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể làm mới phân công trên Supabase.');
  }

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from('assignments').insert(entries);
  if (error) {
    throw new Error(error.message || 'Không thể lưu phân công trên Supabase.');
  }
}

export async function listGlobalAssignments() {
  const { data, error } = await supabase
    .from('global_assignments')
    .select('*');

  if (error) {
    throw new Error(error.message || 'Không thể tải phân công toàn hệ thống từ Supabase.');
  }

  return (data || []) as SupabaseGlobalAssignmentRow[];
}

export async function replaceGlobalAssignments(entries: SupabaseGlobalAssignmentRow[]) {
  const { error: deleteError } = await supabase.from('global_assignments').delete().neq('id', '');
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể làm mới phân công toàn hệ thống trên Supabase.');
  }

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from('global_assignments').insert(entries);
  if (error) {
    throw new Error(error.message || 'Không thể lưu phân công toàn hệ thống trên Supabase.');
  }
}

export async function listRowsByProject(projectId: string) {
  const { count, error: countError } = await supabase
    .from('consolidated_rows')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (countError) {
    throw new Error(countError.message || 'Không thể đếm dữ liệu tổng hợp từ Supabase.');
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
      throw new Error(error.message || 'Không thể tải dữ liệu tổng hợp từ Supabase.');
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
    throw new Error(error.message || 'Không thể lưu dữ liệu tổng hợp lên Supabase.');
  }
}

export async function countRowsByYear(projectId: string, year: string) {
  const { count, error } = await supabase
    .from('consolidated_rows')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('year', year);

  if (error) {
    throw new Error(error.message || 'Không thể đếm dữ liệu theo năm trên Supabase.');
  }

  return count || 0;
}

export async function deleteRowsByProject(projectId: string) {
  const { error } = await supabase.from('consolidated_rows').delete().eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu dự án trên Supabase.');
  }
}

export async function deleteRowsByTemplate(templateId: string) {
  const { error } = await supabase.from('consolidated_rows').delete().eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu biểu mẫu trên Supabase.');
  }
}

export async function deleteRowsByYear(projectId: string, year: string) {
  const { error } = await supabase
    .from('consolidated_rows')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu theo năm trên Supabase.');
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
    throw new Error(error.message || 'Không thể xóa dữ liệu đơn vị trên Supabase.');
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
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('data_files').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Không thể lưu metadata file dữ liệu lên Supabase.');
  }
}

export async function getDataFileRecord(projectId: string, unitCode: string, year: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('*')
    .eq('id', `${projectId}_${unitCode}_${year}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Không thể tải metadata file dữ liệu từ Supabase.');
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
    throw new Error(error.message || 'Không thể tải danh sách file dữ liệu từ Supabase.');
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
    throw new Error(error.message || 'Không thể đếm metadata file theo năm trên Supabase.');
  }

  return count || 0;
}

export async function deleteDataFilesByProject(projectId: string) {
  const { data, error } = await supabase
    .from('data_files')
    .select('storage_path')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Không thể tải metadata file của dự án trên Supabase.');
  }

  const { error: deleteError } = await supabase.from('data_files').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể xóa metadata file của dự án trên Supabase.');
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
    throw new Error(error.message || 'Không thể tải metadata file theo năm trên Supabase.');
  }

  const { error: deleteError } = await supabase
    .from('data_files')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể xóa metadata file theo năm trên Supabase.');
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
    throw new Error(error.message || 'Không thể tải metadata file của đơn vị trên Supabase.');
  }

  const { error: deleteError } = await supabase
    .from('data_files')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('unit_code', unitCode);
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể xóa metadata file của đơn vị trên Supabase.');
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
    throw new Error(error.message || 'Không thể lưu lịch sử xuất báo cáo lên Supabase.');
  }
}

export async function deleteReportExportsByProject(projectId: string) {
  const { data, error } = await supabase
    .from('report_exports')
    .select('storage_path')
    .eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Không thể tải lịch sử xuất báo cáo của dự án.');
  }

  const { error: deleteError } = await supabase.from('report_exports').delete().eq('project_id', projectId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể xóa lịch sử xuất báo cáo của dự án.');
  }

  return ((data || []) as { storage_path: string }[]).map((row) => row.storage_path).filter(Boolean);
}

export async function deleteReportExportsByTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('report_exports')
    .select('storage_path')
    .eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'Không thể tải lịch sử xuất báo cáo của biểu mẫu.');
  }

  const { error: deleteError } = await supabase.from('report_exports').delete().eq('template_id', templateId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Không thể xóa lịch sử xuất báo cáo của biểu mẫu.');
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
