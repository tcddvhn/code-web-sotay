create or replace function public.get_report_row_totals(
  p_project_id text,
  p_template_id text,
  p_year text,
  p_unit_code text default null
)
returns table (
  source_row integer,
  label text,
  row_values jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_rows as (
    select
      r.source_row,
      r.label,
      r.values
    from public.consolidated_rows r
    where r.project_id = p_project_id
      and r.template_id = p_template_id
      and r.year = p_year
      and (
        p_unit_code is null
        or p_unit_code = ''
        or p_unit_code = '__TOTAL_CITY__'
        or r.unit_code = p_unit_code
      )
  ),
  expanded_values as (
    select
      fr.source_row,
      max(fr.label) as label,
      value_item.ordinality - 1 as value_index,
      sum(coalesce(nullif(value_item.value, '')::numeric, 0)) as total_value
    from filtered_rows fr
    cross join lateral jsonb_array_elements_text(coalesce(fr.values, '[]'::jsonb)) with ordinality as value_item(value, ordinality)
    group by fr.source_row, value_item.ordinality
  )
  select
    ev.source_row,
    max(ev.label) as label,
    jsonb_agg(to_jsonb(coalesce(ev.total_value, 0)) order by ev.value_index) as row_values
  from expanded_values ev
  group by ev.source_row
  order by ev.source_row;
$$;

create or replace function public.get_report_cell_details(
  p_project_id text,
  p_template_id text,
  p_year text,
  p_source_row integer,
  p_value_index integer,
  p_unit_code text default null
)
returns table (
  unit_code text,
  unit_name text,
  value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_rows as (
    select
      r.unit_code,
      coalesce(u.name, df.unit_name, r.unit_code) as unit_name,
      coalesce(nullif(r.values ->> p_value_index, '')::numeric, 0) as value
    from public.consolidated_rows r
    left join public.units u on u.code = r.unit_code
    left join public.data_files df
      on df.project_id = r.project_id
     and df.unit_code = r.unit_code
     and df.year = r.year
    where r.project_id = p_project_id
      and r.template_id = p_template_id
      and r.year = p_year
      and r.source_row = p_source_row
      and (
        p_unit_code is null
        or p_unit_code = ''
        or p_unit_code = '__TOTAL_CITY__'
        or r.unit_code = p_unit_code
      )
  )
  select
    fr.unit_code,
    max(fr.unit_name) as unit_name,
    sum(fr.value) as value
  from filtered_rows fr
  group by fr.unit_code
  order by fr.unit_code;
$$;

grant execute on function public.get_report_row_totals(text, text, text, text) to anon, authenticated;
grant execute on function public.get_report_cell_details(text, text, text, integer, integer, text) to anon, authenticated;
