create or replace function public.get_ai_analysis_scope_summary(
  p_project_ids text[],
  p_years text[],
  p_template_ids text[] default null,
  p_unit_codes text[] default null
)
returns table (
  project_count integer,
  template_count integer,
  unit_count integer,
  cell_count bigint,
  total_value numeric,
  distinct_source_rows integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select *
    from public.analysis_cells ac
    where (p_project_ids is null or array_length(p_project_ids, 1) is null or ac.project_id = any(p_project_ids))
      and (p_years is null or array_length(p_years, 1) is null or ac.year = any(p_years))
      and (p_template_ids is null or array_length(p_template_ids, 1) is null or ac.template_id = any(p_template_ids))
      and (p_unit_codes is null or array_length(p_unit_codes, 1) is null or ac.unit_code = any(p_unit_codes))
  )
  select
    count(distinct project_id)::integer as project_count,
    count(distinct template_id)::integer as template_count,
    count(distinct unit_code)::integer as unit_count,
    count(*)::bigint as cell_count,
    coalesce(sum(value), 0)::numeric as total_value,
    count(distinct concat(project_id, ':', template_id, ':', year, ':', source_row))::integer as distinct_source_rows
  from filtered;
$$;

create or replace function public.get_ai_analysis_project_summary(
  p_project_ids text[],
  p_years text[],
  p_template_ids text[] default null,
  p_unit_codes text[] default null
)
returns table (
  project_id text,
  project_name text,
  unit_count integer,
  template_count integer,
  cell_count bigint,
  total_value numeric,
  avg_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select *
    from public.analysis_cells ac
    where (p_project_ids is null or array_length(p_project_ids, 1) is null or ac.project_id = any(p_project_ids))
      and (p_years is null or array_length(p_years, 1) is null or ac.year = any(p_years))
      and (p_template_ids is null or array_length(p_template_ids, 1) is null or ac.template_id = any(p_template_ids))
      and (p_unit_codes is null or array_length(p_unit_codes, 1) is null or ac.unit_code = any(p_unit_codes))
  )
  select
    project_id,
    max(project_name) as project_name,
    count(distinct unit_code)::integer as unit_count,
    count(distinct template_id)::integer as template_count,
    count(*)::bigint as cell_count,
    coalesce(sum(value), 0)::numeric as total_value,
    coalesce(avg(value), 0)::numeric as avg_value
  from filtered
  group by project_id
  order by max(project_name);
$$;

create or replace function public.get_ai_analysis_template_summary(
  p_project_ids text[],
  p_years text[],
  p_template_ids text[] default null,
  p_unit_codes text[] default null
)
returns table (
  template_id text,
  template_name text,
  project_id text,
  project_name text,
  unit_count integer,
  cell_count bigint,
  total_value numeric,
  avg_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select *
    from public.analysis_cells ac
    where (p_project_ids is null or array_length(p_project_ids, 1) is null or ac.project_id = any(p_project_ids))
      and (p_years is null or array_length(p_years, 1) is null or ac.year = any(p_years))
      and (p_template_ids is null or array_length(p_template_ids, 1) is null or ac.template_id = any(p_template_ids))
      and (p_unit_codes is null or array_length(p_unit_codes, 1) is null or ac.unit_code = any(p_unit_codes))
  )
  select
    template_id,
    max(template_name) as template_name,
    max(project_id) as project_id,
    max(project_name) as project_name,
    count(distinct unit_code)::integer as unit_count,
    count(*)::bigint as cell_count,
    coalesce(sum(value), 0)::numeric as total_value,
    coalesce(avg(value), 0)::numeric as avg_value
  from filtered
  group by template_id
  order by max(project_name), max(template_name);
$$;

grant execute on function public.get_ai_analysis_scope_summary(text[], text[], text[], text[]) to authenticated;
grant execute on function public.get_ai_analysis_project_summary(text[], text[], text[], text[]) to authenticated;
grant execute on function public.get_ai_analysis_template_summary(text[], text[], text[], text[]) to authenticated;
