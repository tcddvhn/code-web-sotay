create table if not exists extract_report_blueprints (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  description text,
  fields jsonb not null default '"'"'[]'"'"'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table extract_report_blueprints enable row level security;

drop policy if exists "auth_read_extract_report_blueprints" on extract_report_blueprints;
drop policy if exists "admin_insert_extract_report_blueprints" on extract_report_blueprints;
drop policy if exists "admin_update_extract_report_blueprints" on extract_report_blueprints;
drop policy if exists "admin_delete_extract_report_blueprints" on extract_report_blueprints;
create policy "auth_read_extract_report_blueprints" on extract_report_blueprints for select to authenticated using (public.is_active_user());
create policy "admin_insert_extract_report_blueprints" on extract_report_blueprints for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_extract_report_blueprints" on extract_report_blueprints for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_extract_report_blueprints" on extract_report_blueprints for delete to authenticated using (public.is_admin_user());