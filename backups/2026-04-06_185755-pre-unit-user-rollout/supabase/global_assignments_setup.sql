create table if not exists public.global_assignments (
  id text primary key,
  assignee_key text not null,
  user_id text,
  email text not null,
  display_name text not null,
  unit_codes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.global_assignments enable row level security;

drop policy if exists "auth_read_global_assignments" on public.global_assignments;
drop policy if exists "admin_insert_global_assignments" on public.global_assignments;
drop policy if exists "admin_update_global_assignments" on public.global_assignments;
drop policy if exists "admin_delete_global_assignments" on public.global_assignments;

create policy "auth_read_global_assignments"
on public.global_assignments
for select
to authenticated
using (public.is_active_user());

create policy "admin_insert_global_assignments"
on public.global_assignments
for insert
to authenticated
with check (public.is_admin_user());

create policy "admin_update_global_assignments"
on public.global_assignments
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "admin_delete_global_assignments"
on public.global_assignments
for delete
to authenticated
using (public.is_admin_user());

insert into public.global_assignments (id, assignee_key, user_id, email, display_name, unit_codes, updated_at)
select
  a.assignee_key as id,
  a.assignee_key,
  a.user_id,
  a.email,
  a.display_name,
  a.unit_codes,
  now()
from public.assignments a
join public.projects p on p.id = a.project_id
where lower(trim(p.name)) = lower(trim('THỐNG KÊ SỐ LIỆU SƠ KẾT NQ21'))
on conflict (id) do update
set
  assignee_key = excluded.assignee_key,
  user_id = excluded.user_id,
  email = excluded.email,
  display_name = excluded.display_name,
  unit_codes = excluded.unit_codes,
  updated_at = now();
