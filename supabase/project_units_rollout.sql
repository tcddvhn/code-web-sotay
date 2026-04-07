create table if not exists project_units (
  project_id text not null references projects(id) on delete cascade,
  unit_code text not null references units(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, unit_code)
);

create index if not exists idx_project_units_unit_code on project_units(unit_code);

alter table project_units enable row level security;

drop policy if exists "public_read_project_units" on project_units;
drop policy if exists "auth_read_project_units" on project_units;
drop policy if exists "admin_insert_project_units" on project_units;
drop policy if exists "admin_update_project_units" on project_units;
drop policy if exists "admin_delete_project_units" on project_units;
create policy "public_read_project_units" on project_units for select using (true);
create policy "auth_read_project_units" on project_units for select to authenticated using (public.is_active_user());
create policy "admin_insert_project_units" on project_units for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_project_units" on project_units for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_project_units" on project_units for delete to authenticated using (public.is_admin_user());

insert into project_units (project_id, unit_code)
select p.id, u.code
from projects p
join units u on u.is_deleted = false
where not exists (
  select 1
  from project_units pu
  where pu.project_id = p.id
);