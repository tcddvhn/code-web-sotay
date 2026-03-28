import { supabase } from './supabase';

const SUPABASE_PAGE_SIZE = 1000;

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
  const rows: SupabaseRow[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('consolidated_rows')
      .select('*')
      .eq('project_id', projectId)
      .eq('template_id', templateId)
      .eq('year', year)
      .order('source_row', { ascending: true })
      .order('unit_code', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (unitCode && unitCode !== '__TOTAL_CITY__') {
      query = query.eq('unit_code', unitCode);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data || []) as SupabaseRow[];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}
