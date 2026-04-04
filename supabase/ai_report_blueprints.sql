create table if not exists ai_report_blueprints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by jsonb,
  name text not null,
  source_file_name text,
  source_file_path text,
  source_file_url text,
  source_mime_type text,
  blueprint jsonb not null default '{}'::jsonb,
  status text not null default 'READY'
);

create index if not exists idx_ai_report_blueprints_created_at
  on ai_report_blueprints(created_at desc);

alter table ai_report_blueprints enable row level security;

drop policy if exists "auth_read_ai_report_blueprints" on ai_report_blueprints;
drop policy if exists "auth_insert_ai_report_blueprints" on ai_report_blueprints;
drop policy if exists "auth_update_ai_report_blueprints" on ai_report_blueprints;
drop policy if exists "admin_delete_ai_report_blueprints" on ai_report_blueprints;

create policy "auth_read_ai_report_blueprints" on ai_report_blueprints
for select to authenticated
using (public.is_active_user());

create policy "auth_insert_ai_report_blueprints" on ai_report_blueprints
for insert to authenticated
with check (public.is_active_user());

create policy "auth_update_ai_report_blueprints" on ai_report_blueprints
for update to authenticated
using (public.is_active_user())
with check (public.is_active_user());

create policy "admin_delete_ai_report_blueprints" on ai_report_blueprints
for delete to authenticated
using (public.is_admin_user());
