create table if not exists extract_report_blueprints (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table extract_report_blueprints add column if not exists updated_by_id text;
alter table extract_report_blueprints add column if not exists updated_by_name text;

alter table extract_report_blueprints enable row level security;

drop policy if exists "auth_read_extract_report_blueprints" on extract_report_blueprints;
drop policy if exists "admin_insert_extract_report_blueprints" on extract_report_blueprints;
drop policy if exists "admin_update_extract_report_blueprints" on extract_report_blueprints;
drop policy if exists "admin_delete_extract_report_blueprints" on extract_report_blueprints;
create policy "auth_read_extract_report_blueprints" on extract_report_blueprints for select to authenticated using (public.is_active_user());
create policy "admin_insert_extract_report_blueprints" on extract_report_blueprints for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_extract_report_blueprints" on extract_report_blueprints for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_extract_report_blueprints" on extract_report_blueprints for delete to authenticated using (public.is_admin_user());
create table if not exists extract_report_blueprint_versions (
  id text primary key,
  blueprint_id text not null references extract_report_blueprints(id) on delete cascade,
  version_number integer not null,
  name text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  created_by_id text,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (blueprint_id, version_number)
);

alter table extract_report_blueprint_versions enable row level security;

drop policy if exists "auth_read_extract_report_blueprint_versions" on extract_report_blueprint_versions;
drop policy if exists "admin_insert_extract_report_blueprint_versions" on extract_report_blueprint_versions;
drop policy if exists "admin_delete_extract_report_blueprint_versions" on extract_report_blueprint_versions;
create policy "auth_read_extract_report_blueprint_versions" on extract_report_blueprint_versions for select to authenticated using (public.is_active_user());
create policy "admin_insert_extract_report_blueprint_versions" on extract_report_blueprint_versions for insert to authenticated with check (public.is_admin_user());
create policy "admin_delete_extract_report_blueprint_versions" on extract_report_blueprint_versions for delete to authenticated using (public.is_admin_user());