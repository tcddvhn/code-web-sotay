create extension if not exists pgcrypto;

create table if not exists projects (
  id text primary key,
  name text not null,
  description text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists templates (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  sheet_name text not null,
  is_published boolean not null default false,
  column_headers jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null,
  header_layout jsonb,
  mode text not null default 'MANUAL',
  legacy_config_name text,
  source_workbook_name text,
  source_workbook_path text,
  source_workbook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists units (
  code text primary key,
  name text not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  id text primary key,
  one_drive_link text not null default '',
  storage_path text not null default '',
  received_path text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists assignments (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  assignee_key text not null,
  user_id text,
  email text not null,
  display_name text not null,
  unit_codes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists consolidated_rows (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  template_id text not null references templates(id) on delete cascade,
  unit_code text not null,
  year text not null,
  source_row integer not null,
  label text not null,
  values jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by jsonb
);

create index if not exists idx_consolidated_rows_project_template_year
  on consolidated_rows(project_id, template_id, year);

create index if not exists idx_consolidated_rows_project_unit_year
  on consolidated_rows(project_id, unit_code, year);

create table if not exists data_files (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  unit_code text not null,
  unit_name text,
  year text not null,
  file_name text not null,
  storage_path text not null,
  download_url text,
  updated_at timestamptz not null default now()
);

create table if not exists report_exports (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  template_id text not null,
  template_name text not null,
  unit_code text not null,
  unit_name text not null,
  year text not null,
  file_name text not null,
  storage_path text not null,
  download_url text not null,
  created_at timestamptz not null default now(),
  created_by jsonb
);

alter table projects enable row level security;
alter table templates enable row level security;
alter table units enable row level security;
alter table app_settings enable row level security;
alter table assignments enable row level security;
alter table consolidated_rows enable row level security;
alter table data_files enable row level security;
alter table report_exports enable row level security;

drop policy if exists "public_read_projects" on projects;
create policy "public_read_projects" on projects for select using (true);
drop policy if exists "auth_write_projects" on projects;
create policy "auth_write_projects" on projects for all to authenticated using (true) with check (true);

drop policy if exists "public_read_templates" on templates;
create policy "public_read_templates" on templates for select using (true);
drop policy if exists "auth_write_templates" on templates;
create policy "auth_write_templates" on templates for all to authenticated using (true) with check (true);

drop policy if exists "auth_read_units" on units;
create policy "auth_read_units" on units for select using (true);
drop policy if exists "auth_write_units" on units;
create policy "auth_write_units" on units for all to authenticated using (true) with check (true);

drop policy if exists "auth_read_settings" on app_settings;
create policy "auth_read_settings" on app_settings for select using (true);
drop policy if exists "auth_write_settings" on app_settings;
create policy "auth_write_settings" on app_settings for all to authenticated using (true) with check (true);

drop policy if exists "auth_read_assignments" on assignments;
create policy "auth_read_assignments" on assignments for select using (true);
drop policy if exists "auth_write_assignments" on assignments;
create policy "auth_write_assignments" on assignments for all to authenticated using (true) with check (true);

drop policy if exists "public_read_consolidated_rows" on consolidated_rows;
create policy "public_read_consolidated_rows" on consolidated_rows for select using (true);
drop policy if exists "auth_write_consolidated_rows" on consolidated_rows;
create policy "auth_write_consolidated_rows" on consolidated_rows for all to authenticated using (true) with check (true);

drop policy if exists "public_read_data_files" on data_files;
create policy "public_read_data_files" on data_files for select using (true);
drop policy if exists "auth_write_data_files" on data_files;
create policy "auth_write_data_files" on data_files for all to authenticated using (true) with check (true);

drop policy if exists "auth_read_report_exports" on report_exports;
create policy "auth_read_report_exports" on report_exports for select using (true);
drop policy if exists "auth_write_report_exports" on report_exports;
create policy "auth_write_report_exports" on report_exports for all to authenticated using (true) with check (true);
