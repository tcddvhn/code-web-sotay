create extension if not exists pgcrypto;

create table if not exists analysis_cells (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  project_name text not null,
  template_id text not null references templates(id) on delete cascade,
  template_name text not null,
  sheet_name text not null,
  unit_code text not null references units(code),
  unit_name text not null,
  year text not null,
  source_row integer not null,
  row_label text not null,
  value_index integer not null,
  column_label text not null,
  value numeric not null default 0,
  import_file_id text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analysis_cells_project_year
  on analysis_cells(project_id, year);

create index if not exists idx_analysis_cells_project_template_year
  on analysis_cells(project_id, template_id, year);

create index if not exists idx_analysis_cells_unit_year
  on analysis_cells(unit_code, year);

create index if not exists idx_analysis_cells_scope
  on analysis_cells(project_id, year, template_id, unit_code, source_row, value_index);

create table if not exists ai_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by jsonb,
  project_ids text[] not null default '{}',
  years text[] not null default '{}',
  scope text not null,
  analysis_type text not null,
  writing_tone text not null,
  report_length text not null,
  selected_template_ids text[] not null default '{}',
  selected_unit_codes text[] not null default '{}',
  requested_sections text[] not null default '{}',
  extra_prompt text not null default '',
  scope_snapshot jsonb not null default '{}'::jsonb,
  ai_input jsonb not null default '{}'::jsonb,
  ai_output jsonb,
  docx_file_name text,
  docx_storage_path text,
  docx_download_url text,
  status text not null default 'READY'
);

create index if not exists idx_ai_analysis_reports_created_at
  on ai_analysis_reports(created_at desc);

create index if not exists idx_ai_analysis_reports_scope
  on ai_analysis_reports(scope, analysis_type, writing_tone, report_length);

alter table analysis_cells enable row level security;
alter table ai_analysis_reports enable row level security;

drop policy if exists "auth_read_analysis_cells" on analysis_cells;
drop policy if exists "auth_insert_analysis_cells" on analysis_cells;
drop policy if exists "auth_update_analysis_cells" on analysis_cells;
drop policy if exists "admin_delete_analysis_cells" on analysis_cells;

create policy "auth_read_analysis_cells" on analysis_cells
for select to authenticated
using (public.is_active_user());

create policy "auth_insert_analysis_cells" on analysis_cells
for insert to authenticated
with check (public.is_active_user());

create policy "auth_update_analysis_cells" on analysis_cells
for update to authenticated
using (public.is_active_user())
with check (public.is_active_user());

create policy "admin_delete_analysis_cells" on analysis_cells
for delete to authenticated
using (public.is_admin_user());

drop policy if exists "auth_read_ai_analysis_reports" on ai_analysis_reports;
drop policy if exists "auth_insert_ai_analysis_reports" on ai_analysis_reports;
drop policy if exists "auth_update_ai_analysis_reports" on ai_analysis_reports;
drop policy if exists "admin_delete_ai_analysis_reports" on ai_analysis_reports;

create policy "auth_read_ai_analysis_reports" on ai_analysis_reports
for select to authenticated
using (public.is_active_user());

create policy "auth_insert_ai_analysis_reports" on ai_analysis_reports
for insert to authenticated
with check (public.is_active_user());

create policy "auth_update_ai_analysis_reports" on ai_analysis_reports
for update to authenticated
using (public.is_active_user())
with check (public.is_active_user());

create policy "admin_delete_ai_analysis_reports" on ai_analysis_reports
for delete to authenticated
using (public.is_admin_user());
