import { supabase } from './supabase';

export interface SupabaseAggregatedRow {
  source_row: number;
  label: string;
  values: number[];
}

export interface SupabaseCellDetailRow {
  unit_code: string;
  unit_name: string;
  value: number;
}

function normalizeValues(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : 0;
  });
}

export async function fetchAggregatedRowsFromSupabase(
  projectId: string,
  templateId: string,
  year: string,
  unitCode?: string,
) {
  const { data, error } = await supabase.rpc('get_report_row_totals', {
    p_project_id: projectId,
    p_template_id: templateId,
    p_year: year,
    p_unit_code: unitCode && unitCode !== '__TOTAL_CITY__' ? unitCode : null,
  });

  if (error) {
    throw new Error(error.message || 'Không thể tổng hợp dữ liệu báo cáo từ Supabase.');
  }

  return ((data || []) as { source_row: number; label: string; row_values: unknown }[]).map((row) => ({
    source_row: Number(row.source_row) || 0,
    label: row.label || '',
    values: normalizeValues(row.row_values),
  })) as SupabaseAggregatedRow[];
}

export async function fetchCellDetailsFromSupabase(
  projectId: string,
  templateId: string,
  year: string,
  sourceRow: number,
  valueIndex: number,
  unitCode?: string,
) {
  const { data, error } = await supabase.rpc('get_report_cell_details', {
    p_project_id: projectId,
    p_template_id: templateId,
    p_year: year,
    p_source_row: sourceRow,
    p_value_index: valueIndex,
    p_unit_code: unitCode && unitCode !== '__TOTAL_CITY__' ? unitCode : null,
  });

  if (error) {
    throw new Error(error.message || 'Không thể tải chi tiết ô dữ liệu từ Supabase.');
  }

  return ((data || []) as { unit_code: string; unit_name: string; value: number }[]).map((row) => ({
    unit_code: row.unit_code,
    unit_name: row.unit_name || row.unit_code,
    value: Number(row.value) || 0,
  })) as SupabaseCellDetailRow[];
}
