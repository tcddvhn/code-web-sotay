import { supabase } from './supabase';
import { DataFileRecordSummary, DataRow, FormTemplate, ManagedUnit, Project } from './types';
import {
  listDataFilesByScope as listDataFilesByScopeFromSupabase,
  listRowsByScope as listRowsByScopeFromSupabase,
} from './supabaseStore';

export interface AnalysisCellRecord {
  id: string;
  projectId: string;
  projectName: string;
  templateId: string;
  templateName: string;
  sheetName: string;
  unitCode: string;
  unitName: string;
  year: string;
  sourceRow: number;
  rowLabel: string;
  valueIndex: number;
  columnLabel: string;
  value: number;
  importFileId?: string | null;
  importedAt?: string | null;
  updatedAt?: string | null;
}

export interface AIAnalysisReportRecord {
  id?: string;
  createdAt?: string | null;
  createdBy?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  projectIds: string[];
  years: string[];
  scope: string;
  analysisType: string;
  writingTone: string;
  reportLength: string;
  selectedTemplateIds?: string[];
  selectedUnitCodes?: string[];
  requestedSections?: string[];
  extraPrompt?: string;
  scopeSnapshot: Record<string, unknown>;
  aiInput: Record<string, unknown>;
  aiOutput?: Record<string, unknown> | null;
  docxFileName?: string | null;
  docxStoragePath?: string | null;
  docxDownloadUrl?: string | null;
  status?: string;
}

export interface AIReportBlueprintSection {
  id: string;
  title: string;
  kind: 'opening' | 'metrics_commentary' | 'narrative' | 'risks' | 'recommendations' | 'appendix';
  instructions: string;
}

export interface AIReportBlueprintContent {
  name: string;
  preferredTone: string;
  writingRules: string[];
  requiredTables: string[];
  sections: AIReportBlueprintSection[];
}

export interface AIReportBlueprintRecord {
  id?: string;
  createdAt?: string | null;
  createdBy?: {
    uid?: string | null;
    email?: string | null;
    displayName?: string | null;
  } | null;
  name: string;
  sourceFileName?: string | null;
  sourceFilePath?: string | null;
  sourceFileUrl?: string | null;
  sourceMimeType?: string | null;
  blueprint: AIReportBlueprintContent;
  status?: 'DRAFT' | 'READY';
}

export interface AIIndicatorSummary {
  indicatorKey: string;
  projectIds: string[];
  projectNames: string[];
  templateId: string;
  templateName: string;
  sheetName: string;
  rowLabel: string;
  columnLabel: string;
  indicatorLabel: string;
  unitCount: number;
  nonZeroUnitCount: number;
  cellCount: number;
  totalValue: number;
  averageValue: number;
  minValue: number;
  maxValue: number;
  topUnits: { unitCode: string; unitName: string; value: number }[];
}

type ScopeSummaryLike = {
  project_count?: number;
  template_count?: number;
  unit_count?: number;
  cell_count?: number;
  total_value?: number;
  distinct_source_rows?: number;
};

type SummaryRowLike = {
  project_id?: string;
  project_name?: string;
  template_id?: string;
  template_name?: string;
  unit_count?: number;
  template_count?: number;
  cell_count?: number;
  total_value?: number;
  avg_value?: number;
};

type SupabaseAnalysisCellRow = {
  id: string;
  project_id: string;
  project_name: string;
  template_id: string;
  template_name: string;
  sheet_name: string;
  unit_code: string;
  unit_name: string;
  year: string;
  source_row: number;
  row_label: string;
  value_index: number;
  column_label: string;
  value: number;
  import_file_id: string | null;
  imported_at: string | null;
  updated_at: string | null;
};

type SupabaseAIAnalysisReportRow = {
  id: string;
  created_at: string | null;
  created_by: AIAnalysisReportRecord['createdBy'];
  project_ids: string[] | null;
  years: string[] | null;
  scope: string;
  analysis_type: string;
  writing_tone: string;
  report_length: string;
  selected_template_ids: string[] | null;
  selected_unit_codes: string[] | null;
  requested_sections: string[] | null;
  extra_prompt: string | null;
  scope_snapshot: Record<string, unknown>;
  ai_input: Record<string, unknown>;
  ai_output: Record<string, unknown> | null;
  docx_file_name: string | null;
  docx_storage_path: string | null;
  docx_download_url: string | null;
  status: string;
};

type SupabaseAIReportBlueprintRow = {
  id: string;
  created_at: string | null;
  created_by: AIReportBlueprintRecord['createdBy'];
  name: string;
  source_file_name: string | null;
  source_file_path: string | null;
  source_file_url: string | null;
  source_mime_type: string | null;
  blueprint: AIReportBlueprintContent;
  status: string;
};

const BLUEPRINT_STORAGE_KEY = 'sotay_ai_report_blueprints';

function nowIso() {
  return new Date().toISOString();
}

function normalizeValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAnalysisCellId(
  projectId: string,
  templateId: string,
  unitCode: string,
  year: string,
  sourceRow: number,
  valueIndex: number,
) {
  return `${projectId}_${templateId}_${unitCode}_${year}_${sourceRow}_${valueIndex}`;
}

function toAnalysisCellPayload(record: AnalysisCellRecord) {
  return {
    id: record.id,
    project_id: record.projectId,
    project_name: record.projectName,
    template_id: record.templateId,
    template_name: record.templateName,
    sheet_name: record.sheetName,
    unit_code: record.unitCode,
    unit_name: record.unitName,
    year: record.year,
    source_row: record.sourceRow,
    row_label: record.rowLabel,
    value_index: record.valueIndex,
    column_label: record.columnLabel,
    value: normalizeValue(record.value),
    import_file_id: record.importFileId || null,
    imported_at: record.importedAt || nowIso(),
    updated_at: record.updatedAt || nowIso(),
  };
}

function mapAnalysisCell(row: SupabaseAnalysisCellRow): AnalysisCellRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    templateId: row.template_id,
    templateName: row.template_name,
    sheetName: row.sheet_name,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    year: row.year,
    sourceRow: row.source_row,
    rowLabel: row.row_label,
    valueIndex: row.value_index,
    columnLabel: row.column_label,
    value: normalizeValue(row.value),
    importFileId: row.import_file_id,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}

function mapAIAnalysisReport(row: SupabaseAIAnalysisReportRow): AIAnalysisReportRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    createdBy: row.created_by || null,
    projectIds: row.project_ids || [],
    years: row.years || [],
    scope: row.scope,
    analysisType: row.analysis_type,
    writingTone: row.writing_tone,
    reportLength: row.report_length,
    selectedTemplateIds: row.selected_template_ids || [],
    selectedUnitCodes: row.selected_unit_codes || [],
    requestedSections: row.requested_sections || [],
    extraPrompt: row.extra_prompt || '',
    scopeSnapshot: row.scope_snapshot || {},
    aiInput: row.ai_input || {},
    aiOutput: row.ai_output || null,
    docxFileName: row.docx_file_name,
    docxStoragePath: row.docx_storage_path,
    docxDownloadUrl: row.docx_download_url,
    status: row.status,
  };
}

function mapAIReportBlueprint(row: SupabaseAIReportBlueprintRow): AIReportBlueprintRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    createdBy: row.created_by || null,
    name: row.name,
    sourceFileName: row.source_file_name,
    sourceFilePath: row.source_file_path,
    sourceFileUrl: row.source_file_url,
    sourceMimeType: row.source_mime_type,
    blueprint: row.blueprint,
    status: (row.status as 'DRAFT' | 'READY') || 'READY',
  };
}

function shouldFallbackBlueprintStorage(error: unknown) {
  return (
    error instanceof Error &&
    /ai_report_blueprints|does not exist|Could not find the table|relation .*ai_report_blueprints/i.test(
      error.message,
    )
  );
}

function readLocalBlueprints(): AIReportBlueprintRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(BLUEPRINT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AIReportBlueprintRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalBlueprints(records: AIReportBlueprintRecord[]) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(records));
}

export function buildAnalysisCellsFromRows({
  rows,
  templates,
  projects,
  units,
  dataFiles,
}: {
  rows: DataRow[];
  templates: FormTemplate[];
  projects: Project[];
  units: ManagedUnit[];
  dataFiles: DataFileRecordSummary[];
}) {
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const unitMap = new Map(units.map((unit) => [unit.code, unit]));
  const dataFileMap = new Map(
    dataFiles.map((file) => [`${file.projectId}_${file.unitCode}_${file.year}`, file]),
  );

  const cells: AnalysisCellRecord[] = [];

  rows.forEach((row) => {
    const template = templateMap.get(row.templateId);
    const project = projectMap.get(row.projectId);
    const unit = unitMap.get(row.unitCode);
    const dataFile = dataFileMap.get(`${row.projectId}_${row.unitCode}_${row.year}`);

    row.values.forEach((rawValue, valueIndex) => {
      const columnLabel =
        template?.columnHeaders?.[valueIndex] ||
        template?.columnMapping?.blocks
          ?.find((block) => row.sourceRow >= block.startRow && row.sourceRow <= block.endRow)
          ?.columnHeaders?.[valueIndex] ||
        `Cột ${valueIndex + 1}`;

      cells.push({
        id: buildAnalysisCellId(
          row.projectId,
          row.templateId,
          row.unitCode,
          row.year,
          row.sourceRow,
          valueIndex,
        ),
        projectId: row.projectId,
        projectName: project?.name || row.projectId,
        templateId: row.templateId,
        templateName: template?.name || row.templateId,
        sheetName: template?.sheetName || '',
        unitCode: row.unitCode,
        unitName: unit?.name || dataFile?.unitName || row.unitCode,
        year: row.year,
        sourceRow: row.sourceRow,
        rowLabel: row.label,
        valueIndex,
        columnLabel,
        value: normalizeValue(rawValue),
        importFileId: dataFile?.id || null,
        importedAt:
          (typeof row.updatedAt === 'string' ? row.updatedAt : null) ||
          (typeof dataFile?.updatedAt === 'string' ? dataFile.updatedAt : null) ||
          nowIso(),
        updatedAt:
          (typeof row.updatedAt === 'string' ? row.updatedAt : null) || nowIso(),
      });
    });
  });

  return cells;
}

export function buildIndicatorSummariesFromRows({
  rows,
  templates,
  projects,
  units,
  dataFiles,
  maxIndicators = 80,
  maxUnitsPerIndicator = 5,
}: {
  rows: DataRow[];
  templates: FormTemplate[];
  projects: Project[];
  units: ManagedUnit[];
  dataFiles: DataFileRecordSummary[];
  maxIndicators?: number;
  maxUnitsPerIndicator?: number;
}) {
  const cells = buildAnalysisCellsFromRows({ rows, templates, projects, units, dataFiles });
  const buckets = new Map<
    string,
    {
      indicatorKey: string;
      projectIds: Set<string>;
      projectNames: Set<string>;
      templateId: string;
      templateName: string;
      sheetName: string;
      rowLabel: string;
      columnLabel: string;
      unitValues: Map<string, { unitCode: string; unitName: string; value: number }>;
      cellCount: number;
      totalValue: number;
      minValue: number;
      maxValue: number;
      nonZeroUnitCodes: Set<string>;
    }
  >();

  cells.forEach((cell) => {
    const indicatorKey = [
      cell.templateId,
      cell.sheetName || 'sheet',
      cell.rowLabel || 'row',
      cell.columnLabel || 'column',
    ].join('__');

    const current = buckets.get(indicatorKey) || {
      indicatorKey,
      projectIds: new Set<string>(),
      projectNames: new Set<string>(),
      templateId: cell.templateId,
      templateName: cell.templateName,
      sheetName: cell.sheetName,
      rowLabel: cell.rowLabel,
      columnLabel: cell.columnLabel,
      unitValues: new Map<string, { unitCode: string; unitName: string; value: number }>(),
      cellCount: 0,
      totalValue: 0,
      minValue: Number.POSITIVE_INFINITY,
      maxValue: Number.NEGATIVE_INFINITY,
      nonZeroUnitCodes: new Set<string>(),
    };

    current.projectIds.add(cell.projectId);
    current.projectNames.add(cell.projectName);
    current.cellCount += 1;
    current.totalValue += normalizeValue(cell.value);
    current.minValue = Math.min(current.minValue, normalizeValue(cell.value));
    current.maxValue = Math.max(current.maxValue, normalizeValue(cell.value));
    if (normalizeValue(cell.value) !== 0) {
      current.nonZeroUnitCodes.add(cell.unitCode);
    }

    const previousUnit = current.unitValues.get(cell.unitCode) || {
      unitCode: cell.unitCode,
      unitName: cell.unitName,
      value: 0,
    };
    previousUnit.value += normalizeValue(cell.value);
    current.unitValues.set(cell.unitCode, previousUnit);

    buckets.set(indicatorKey, current);
  });

  return Array.from(buckets.values())
    .map((item) => {
      const topUnits = Array.from(item.unitValues.values())
        .sort((left, right) => right.value - left.value)
        .slice(0, maxUnitsPerIndicator);

      return {
        indicatorKey: item.indicatorKey,
        projectIds: Array.from(item.projectIds),
        projectNames: Array.from(item.projectNames),
        templateId: item.templateId,
        templateName: item.templateName,
        sheetName: item.sheetName,
        rowLabel: item.rowLabel,
        columnLabel: item.columnLabel,
        indicatorLabel: `${item.rowLabel} > ${item.columnLabel}`,
        unitCount: item.unitValues.size,
        nonZeroUnitCount: item.nonZeroUnitCodes.size,
        cellCount: item.cellCount,
        totalValue: item.totalValue,
        averageValue: item.cellCount > 0 ? item.totalValue / item.cellCount : 0,
        minValue: Number.isFinite(item.minValue) ? item.minValue : 0,
        maxValue: Number.isFinite(item.maxValue) ? item.maxValue : 0,
        topUnits,
      } satisfies AIIndicatorSummary;
    })
    .sort((left, right) => {
      if (right.nonZeroUnitCount !== left.nonZeroUnitCount) {
        return right.nonZeroUnitCount - left.nonZeroUnitCount;
      }
      return Math.abs(right.totalValue) - Math.abs(left.totalValue);
    })
    .slice(0, maxIndicators);
}

export async function upsertAnalysisCells(cells: AnalysisCellRecord[]) {
  if (cells.length === 0) {
    return;
  }

  const chunkSize = 1000;
  for (let start = 0; start < cells.length; start += chunkSize) {
    const payload = cells.slice(start, start + chunkSize).map(toAnalysisCellPayload);
    const { error } = await supabase.from('analysis_cells').upsert(payload, { onConflict: 'id' });
    if (error) {
      throw new Error(error.message || 'Không thể lưu dữ liệu phân tích AI lên Supabase.');
    }

    if (start + chunkSize < cells.length) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
}

export async function syncAnalysisCellsFromRows(params: {
  rows: DataRow[];
  templates: FormTemplate[];
  projects: Project[];
  units: ManagedUnit[];
  dataFiles: DataFileRecordSummary[];
}) {
  const cells = buildAnalysisCellsFromRows(params);
  await upsertAnalysisCells(cells);
  return cells.length;
}

export async function backfillAnalysisCellsForScope(params: {
  projectIds: string[];
  years: string[];
  templateIds?: string[];
  unitCodes?: string[];
  templates: FormTemplate[];
  projects: Project[];
  units: ManagedUnit[];
}) {
  const allRows: DataRow[] = [];
  const allFiles: DataFileRecordSummary[] = [];

  for (const projectId of params.projectIds) {
    const [rows, files] = await Promise.all([
      listRowsByScopeFromSupabase({
        projectId,
        years: params.years,
        templateIds: params.templateIds,
        unitCodes: params.unitCodes,
      }),
      listDataFilesByScopeFromSupabase({
        projectId,
        years: params.years,
        unitCodes: params.unitCodes,
      }),
    ]);

    allRows.push(...rows);
    allFiles.push(...files);
  }

  if (allRows.length === 0) {
    return 0;
  }

  return syncAnalysisCellsFromRows({
    rows: allRows,
    templates: params.templates,
    projects: params.projects,
    units: params.units,
    dataFiles: allFiles,
  });
}

export async function fetchOperationalScopeSummary(params: {
  projectIds: string[];
  years: string[];
  templateIds?: string[];
  unitCodes?: string[];
}) {
  const allRows: DataRow[] = [];

  for (const projectId of params.projectIds) {
    const rows = await listRowsByScopeFromSupabase({
      projectId,
      years: params.years,
      templateIds: params.templateIds,
      unitCodes: params.unitCodes,
    });
    allRows.push(...rows);
  }

  const projectIds = new Set(allRows.map((row) => row.projectId));
  const templateIds = new Set(allRows.map((row) => row.templateId));
  const unitCodes = new Set(allRows.map((row) => row.unitCode));
  const cellCount = allRows.reduce((sum, row) => sum + row.values.length, 0);
  const totalValue = allRows.reduce(
    (sum, row) => sum + row.values.reduce((rowSum, value) => rowSum + normalizeValue(value), 0),
    0,
  );

  return {
    project_count: projectIds.size,
    template_count: templateIds.size,
    unit_count: unitCodes.size,
    cell_count: cellCount,
    total_value: totalValue,
    distinct_source_rows: allRows.length,
  };
}

export async function listAnalysisCellsByScope({
  projectIds,
  years,
  templateIds,
  unitCodes,
  limit = 5000,
}: {
  projectIds?: string[];
  years?: string[];
  templateIds?: string[];
  unitCodes?: string[];
  limit?: number;
}) {
  let query = supabase
    .from('analysis_cells')
    .select('*')
    .order('project_name', { ascending: true })
    .order('template_name', { ascending: true })
    .order('unit_code', { ascending: true })
    .order('source_row', { ascending: true })
    .order('value_index', { ascending: true })
    .limit(limit);

  if (projectIds && projectIds.length > 0) {
    query = query.in('project_id', projectIds);
  }
  if (years && years.length > 0) {
    query = query.in('year', years);
  }
  if (templateIds && templateIds.length > 0) {
    query = query.in('template_id', templateIds);
  }
  if (unitCodes && unitCodes.length > 0) {
    query = query.in('unit_code', unitCodes);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Không thể tải dữ liệu phân tích AI từ Supabase.');
  }

  return ((data || []) as SupabaseAnalysisCellRow[]).map(mapAnalysisCell);
}

export async function deleteAnalysisCellsByProject(projectId: string) {
  const { error } = await supabase.from('analysis_cells').delete().eq('project_id', projectId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu phân tích AI theo dự án.');
  }
}

export async function deleteAnalysisCellsByTemplate(templateId: string) {
  const { error } = await supabase.from('analysis_cells').delete().eq('template_id', templateId);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu phân tích AI theo biểu mẫu.');
  }
}

export async function deleteAnalysisCellsByYear(projectId: string, year: string) {
  const { error } = await supabase
    .from('analysis_cells')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu phân tích AI theo năm.');
  }
}

export async function deleteAnalysisCellsByUnit(projectId: string, year: string, unitCode: string) {
  const { error } = await supabase
    .from('analysis_cells')
    .delete()
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('unit_code', unitCode);
  if (error) {
    throw new Error(error.message || 'Không thể xóa dữ liệu phân tích AI theo đơn vị.');
  }
}

export async function createAIAnalysisReport(record: AIAnalysisReportRecord) {
  const payload = {
    created_at: record.createdAt || nowIso(),
    created_by: record.createdBy || null,
    project_ids: record.projectIds,
    years: record.years,
    scope: record.scope,
    analysis_type: record.analysisType,
    writing_tone: record.writingTone,
    report_length: record.reportLength,
    selected_template_ids: record.selectedTemplateIds || [],
    selected_unit_codes: record.selectedUnitCodes || [],
    requested_sections: record.requestedSections || [],
    extra_prompt: record.extraPrompt || '',
    scope_snapshot: record.scopeSnapshot,
    ai_input: record.aiInput,
    ai_output: record.aiOutput || null,
    docx_file_name: record.docxFileName || null,
    docx_storage_path: record.docxStoragePath || null,
    docx_download_url: record.docxDownloadUrl || null,
    status: record.status || 'READY',
  };

  const { data, error } = await supabase
    .from('ai_analysis_reports')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Không thể lưu lịch sử báo cáo phân tích AI.');
  }

  return mapAIAnalysisReport(data as SupabaseAIAnalysisReportRow);
}

export async function updateAIAnalysisReport(
  reportId: string,
  patch: Partial<AIAnalysisReportRecord>,
) {
  const payload: Record<string, unknown> = {};

  if (patch.aiOutput !== undefined) payload.ai_output = patch.aiOutput;
  if (patch.docxFileName !== undefined) payload.docx_file_name = patch.docxFileName;
  if (patch.docxStoragePath !== undefined) payload.docx_storage_path = patch.docxStoragePath;
  if (patch.docxDownloadUrl !== undefined) payload.docx_download_url = patch.docxDownloadUrl;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.scopeSnapshot !== undefined) payload.scope_snapshot = patch.scopeSnapshot;
  if (patch.aiInput !== undefined) payload.ai_input = patch.aiInput;
  if (patch.extraPrompt !== undefined) payload.extra_prompt = patch.extraPrompt;

  const { data, error } = await supabase
    .from('ai_analysis_reports')
    .update(payload)
    .eq('id', reportId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Không thể cập nhật lịch sử báo cáo phân tích AI.');
  }

  return mapAIAnalysisReport(data as SupabaseAIAnalysisReportRow);
}

export async function listRecentAIAnalysisReports(limit = 20) {
  const { data, error } = await supabase
    .from('ai_analysis_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Không thể tải lịch sử báo cáo phân tích AI.');
  }

  return ((data || []) as SupabaseAIAnalysisReportRow[]).map(mapAIAnalysisReport);
}

export async function listAIReportBlueprints(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('ai_report_blueprints')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message || 'Không thể tải danh sách mẫu báo cáo AI.');
    }

    return ((data || []) as SupabaseAIReportBlueprintRow[]).map(mapAIReportBlueprint);
  } catch (error) {
    if (!shouldFallbackBlueprintStorage(error)) {
      throw error;
    }
    return readLocalBlueprints().slice(0, limit);
  }
}

export async function createAIReportBlueprint(record: AIReportBlueprintRecord) {
  const payload = {
    created_at: record.createdAt || nowIso(),
    created_by: record.createdBy || null,
    name: record.name,
    source_file_name: record.sourceFileName || null,
    source_file_path: record.sourceFilePath || null,
    source_file_url: record.sourceFileUrl || null,
    source_mime_type: record.sourceMimeType || null,
    blueprint: record.blueprint,
    status: record.status || 'READY',
  };

  try {
    const { data, error } = await supabase
      .from('ai_report_blueprints')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Không thể lưu mẫu báo cáo AI.');
    }

    return mapAIReportBlueprint(data as SupabaseAIReportBlueprintRow);
  } catch (error) {
    if (!shouldFallbackBlueprintStorage(error)) {
      throw error;
    }

    const localRecord: AIReportBlueprintRecord = {
      ...record,
      id: record.id || `local_blueprint_${Date.now()}`,
      createdAt: record.createdAt || nowIso(),
      status: record.status || 'READY',
    };
    const current = readLocalBlueprints();
    writeLocalBlueprints([localRecord, ...current.filter((item) => item.id !== localRecord.id)]);
    return localRecord;
  }
}

export async function fetchAIAnalysisScopeSummary(params: {
  projectIds: string[];
  years: string[];
  templateIds?: string[];
  unitCodes?: string[];
}) {
  const { data, error } = await supabase.rpc('get_ai_analysis_scope_summary', {
    p_project_ids: params.projectIds,
    p_years: params.years,
    p_template_ids: params.templateIds && params.templateIds.length > 0 ? params.templateIds : null,
    p_unit_codes: params.unitCodes && params.unitCodes.length > 0 ? params.unitCodes : null,
  });

  if (error) {
    throw new Error(error.message || 'Không thể tải tổng quan phạm vi phân tích AI.');
  }

  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function fetchAIAnalysisProjectSummary(params: {
  projectIds: string[];
  years: string[];
  templateIds?: string[];
  unitCodes?: string[];
}) {
  const { data, error } = await supabase.rpc('get_ai_analysis_project_summary', {
    p_project_ids: params.projectIds,
    p_years: params.years,
    p_template_ids: params.templateIds && params.templateIds.length > 0 ? params.templateIds : null,
    p_unit_codes: params.unitCodes && params.unitCodes.length > 0 ? params.unitCodes : null,
  });

  if (error) {
    throw new Error(error.message || 'Không thể tải tổng hợp theo dự án cho phân tích AI.');
  }

  return Array.isArray(data) ? data : [];
}

export async function fetchAIAnalysisTemplateSummary(params: {
  projectIds: string[];
  years: string[];
  templateIds?: string[];
  unitCodes?: string[];
}) {
  const { data, error } = await supabase.rpc('get_ai_analysis_template_summary', {
    p_project_ids: params.projectIds,
    p_years: params.years,
    p_template_ids: params.templateIds && params.templateIds.length > 0 ? params.templateIds : null,
    p_unit_codes: params.unitCodes && params.unitCodes.length > 0 ? params.unitCodes : null,
  });

  if (error) {
    throw new Error(error.message || 'Không thể tải tổng hợp theo biểu cho phân tích AI.');
  }

  return Array.isArray(data) ? data : [];
}

export type { ScopeSummaryLike, SummaryRowLike };
