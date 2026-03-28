import { supabase } from './supabase';

export interface SupabaseRow {
  id: string;
  project_id: string;
  template_id: string;
  unit_code: string;
  unit_name: string;
  year: string;
  source_row: number;
  label: string;
  values: number[];
  created_at: string;
}

export async function fetchRowsFromSupabase(
  projectId: string,
  templateId: string,
  year: string,
  unitCode?: string,
) {
  let query = supabase
    .from('consolidated_rows')
    .select('*')
    .eq('project_id', projectId)
    .eq('template_id', templateId)
    .eq('year', year)
    .order('source_row', { ascending: true });

  if (unitCode && unitCode !== '__TOTAL_CITY__') {
    query = query.eq('unit_code', unitCode);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data || []) as SupabaseRow[];
  return rows;
}
