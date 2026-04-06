create extension if not exists pgcrypto;

alter table if exists user_profiles
  add column if not exists unit_code text,
  add column if not exists unit_name text;

alter table if exists user_profiles
  drop constraint if exists user_profiles_role_check;

alter table if exists user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'contributor', 'unit_user'));

create table if not exists data_overwrite_requests (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  project_name text,
  unit_code text not null,
  unit_name text not null,
  year text not null,
  file_name text not null,
  storage_path text not null,
  download_url text,
  row_payload jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by jsonb,
  review_note text,
  reviewed_at timestamptz,
  reviewed_by jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_overwrite_requests_project_status
  on data_overwrite_requests(project_id, status, created_at desc);

alter table if exists data_overwrite_requests enable row level security;

drop policy if exists "self_insert_unit_user_profiles" on user_profiles;
create policy "self_insert_unit_user_profiles" on user_profiles
for insert to authenticated
with check (
  auth.email() = email
  and role = 'unit_user'
  and coalesce(unit_code, '') <> ''
);

drop policy if exists "admin_read_data_overwrite_requests" on data_overwrite_requests;
drop policy if exists "unit_read_own_data_overwrite_requests" on data_overwrite_requests;
drop policy if exists "unit_insert_own_data_overwrite_requests" on data_overwrite_requests;
drop policy if exists "admin_update_data_overwrite_requests" on data_overwrite_requests;
drop policy if exists "admin_delete_data_overwrite_requests" on data_overwrite_requests;

create policy "admin_read_data_overwrite_requests" on data_overwrite_requests
for select to authenticated
using (public.is_admin_user());

create policy "unit_read_own_data_overwrite_requests" on data_overwrite_requests
for select to authenticated
using (
  public.is_active_user()
  and coalesce(requested_by ->> 'email', '') = auth.email()
);

create policy "unit_insert_own_data_overwrite_requests" on data_overwrite_requests
for insert to authenticated
with check (
  public.is_active_user()
  and coalesce(requested_by ->> 'email', '') = auth.email()
);

create policy "admin_update_data_overwrite_requests" on data_overwrite_requests
for update to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "admin_delete_data_overwrite_requests" on data_overwrite_requests
for delete to authenticated
using (public.is_admin_user());
