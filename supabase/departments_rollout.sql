create table if not exists public.departments (
  id text primary key,
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_members (
  id text primary key,
  department_id text not null references public.departments(id) on delete cascade,
  user_email text not null,
  auth_user_id uuid,
  display_name text not null,
  membership_role text not null check (membership_role in ('manager', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_department_members_user_email on public.department_members(lower(user_email));
create index if not exists idx_department_members_department_id on public.department_members(department_id);

alter table public.projects add column if not exists owner_department_id text references public.departments(id) on delete set null;
alter table public.projects add column if not exists created_by_email text;
alter table public.projects add column if not exists created_by_auth_user_id uuid;

insert into public.departments (id, code, name, is_active, sort_order)
values
  ('PB01', 'PB01', 'Phòng Tổ chức đảng, đảng viên', true, 1),
  ('PB02', 'PB02', 'Phòng Bảo vệ chính trị Nội bộ', true, 2),
  ('PB03', 'PB03', 'Phòng Tổ chức cán bộ', true, 3),
  ('PB04', 'PB04', 'Phòng địa bàn xã, phường', true, 4),
  ('PB05', 'PB05', 'Văn phòng ban', true, 5)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.projects
set owner_department_id = 'PB05'
where owner_department_id is null;

create or replace function public.current_department_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select dm.department_id
  from public.department_members dm
  where dm.user_email = auth.email()
    and dm.is_active = true
  order by case when dm.membership_role = 'manager' then 0 else 1 end, dm.created_at
  limit 1;
$$;

create or replace function public.is_department_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_members dm
    where dm.user_email = auth.email()
      and dm.membership_role = 'manager'
      and dm.is_active = true
  );
$$;

create or replace function public.can_manage_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_user()
    or exists (
      select 1
      from public.projects p
      join public.department_members dm on dm.department_id = p.owner_department_id
      where p.id = p_project_id
        and dm.user_email = auth.email()
        and dm.membership_role = 'manager'
        and dm.is_active = true
    );
$$;

create or replace function public.current_unit_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select up.unit_code
  from public.user_profiles up
  where lower(up.email) = lower(auth.email())
    and up.role = 'unit_user'
    and up.is_active = true
    and coalesce(up.unit_code, '') <> ''
  limit 1;
$$;

create or replace function public.can_access_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_user()
    or exists (
      select 1
      from public.projects p
      join public.department_members dm on dm.department_id = p.owner_department_id
      where p.id = p_project_id
        and dm.user_email = auth.email()
        and dm.is_active = true
    )
    or exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and public.current_unit_code() is not null
        and (
          not exists (
            select 1
            from public.project_units pu_any
            where pu_any.project_id = p.id
          )
          or exists (
            select 1
            from public.project_units pu
            where pu.project_id = p.id
              and pu.unit_code = public.current_unit_code()
          )
        )
    );
$$;

create or replace function public.can_access_project_unit(p_project_id text, p_unit_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_user()
    or exists (
      select 1
      from public.projects p
      join public.department_members dm on dm.department_id = p.owner_department_id
      where p.id = p_project_id
        and dm.user_email = auth.email()
        and dm.is_active = true
    )
    or (
      public.current_unit_code() is not null
      and p_unit_code = public.current_unit_code()
      and exists (
        select 1
        from public.projects p
        where p.id = p_project_id
          and (
            not exists (
              select 1
              from public.project_units pu_any
              where pu_any.project_id = p.id
            )
            or exists (
              select 1
              from public.project_units pu
              where pu.project_id = p.id
                and pu.unit_code = public.current_unit_code()
            )
          )
      )
    );
$$;

alter table public.departments enable row level security;
alter table public.department_members enable row level security;

drop policy if exists "auth_read_departments" on public.departments;
drop policy if exists "admin_insert_departments" on public.departments;
drop policy if exists "admin_update_departments" on public.departments;
drop policy if exists "admin_delete_departments" on public.departments;
create policy "auth_read_departments" on public.departments for select to authenticated using (public.is_active_user());
create policy "admin_insert_departments" on public.departments for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_departments" on public.departments for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_departments" on public.departments for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_department_members" on public.department_members;
drop policy if exists "scoped_read_department_members" on public.department_members;
drop policy if exists "admin_insert_department_members" on public.department_members;
drop policy if exists "admin_update_department_members" on public.department_members;
drop policy if exists "admin_delete_department_members" on public.department_members;
create policy "scoped_read_department_members" on public.department_members
for select to authenticated
using (
  public.is_admin_user()
  or lower(user_email) = lower(auth.email())
  or (
    public.current_department_id() is not null
    and department_id = public.current_department_id()
  )
);
create policy "admin_insert_department_members" on public.department_members for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_department_members" on public.department_members for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_department_members" on public.department_members for delete to authenticated using (public.is_admin_user());

drop policy if exists "public_read_projects" on public.projects;
drop policy if exists "auth_read_projects" on public.projects;
drop policy if exists "scoped_read_projects" on public.projects;
create policy "scoped_read_projects" on public.projects
for select to authenticated
using (public.can_access_project(id));

drop policy if exists "manager_insert_projects" on public.projects;
drop policy if exists "manager_update_projects" on public.projects;
drop policy if exists "manager_delete_projects" on public.projects;
create policy "manager_insert_projects" on public.projects
for insert to authenticated
with check (
  public.is_department_manager()
  and owner_department_id = public.current_department_id()
);
create policy "manager_update_projects" on public.projects
for update to authenticated
using (public.can_manage_project(id))
with check (
  public.is_admin_user()
  or (
    public.is_department_manager()
    and owner_department_id = public.current_department_id()
  )
);

drop policy if exists "public_read_project_units" on public.project_units;
drop policy if exists "auth_read_project_units" on public.project_units;
drop policy if exists "scoped_read_project_units" on public.project_units;
create policy "scoped_read_project_units" on public.project_units
for select to authenticated
using (public.can_access_project_unit(project_id, unit_code));

drop policy if exists "manager_insert_project_units" on public.project_units;
drop policy if exists "manager_update_project_units" on public.project_units;
drop policy if exists "manager_delete_project_units" on public.project_units;
create policy "manager_insert_project_units" on public.project_units
for insert to authenticated
with check (public.can_manage_project(project_id));
create policy "manager_update_project_units" on public.project_units
for update to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));
create policy "manager_delete_project_units" on public.project_units
for delete to authenticated
using (public.can_manage_project(project_id));

drop policy if exists "public_read_templates" on public.templates;
drop policy if exists "auth_read_templates" on public.templates;
drop policy if exists "scoped_read_templates" on public.templates;
create policy "scoped_read_templates" on public.templates
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists "manager_insert_templates" on public.templates;
drop policy if exists "manager_update_templates" on public.templates;
drop policy if exists "manager_delete_templates" on public.templates;
create policy "manager_insert_templates" on public.templates
for insert to authenticated
with check (public.can_manage_project(project_id));
create policy "manager_update_templates" on public.templates
for update to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));
create policy "manager_delete_templates" on public.templates
for delete to authenticated
using (public.can_manage_project(project_id));

drop policy if exists "auth_read_extract_report_blueprints" on public.extract_report_blueprints;
drop policy if exists "scoped_read_extract_report_blueprints" on public.extract_report_blueprints;
create policy "scoped_read_extract_report_blueprints" on public.extract_report_blueprints
for select to authenticated
using (public.can_access_project(project_id));

drop policy if exists "manager_insert_extract_report_blueprints" on public.extract_report_blueprints;
drop policy if exists "manager_update_extract_report_blueprints" on public.extract_report_blueprints;
drop policy if exists "manager_delete_extract_report_blueprints" on public.extract_report_blueprints;
create policy "manager_insert_extract_report_blueprints" on public.extract_report_blueprints
for insert to authenticated
with check (public.can_manage_project(project_id));
create policy "manager_update_extract_report_blueprints" on public.extract_report_blueprints
for update to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));
create policy "manager_delete_extract_report_blueprints" on public.extract_report_blueprints
for delete to authenticated
using (public.can_manage_project(project_id));

drop policy if exists "auth_read_extract_report_blueprint_versions" on public.extract_report_blueprint_versions;
drop policy if exists "scoped_read_extract_report_blueprint_versions" on public.extract_report_blueprint_versions;
create policy "scoped_read_extract_report_blueprint_versions" on public.extract_report_blueprint_versions
for select to authenticated
using (
  exists (
    select 1
    from public.extract_report_blueprints bp
    where bp.id = blueprint_id
      and public.can_access_project(bp.project_id)
  )
);

drop policy if exists "manager_insert_extract_report_blueprint_versions" on public.extract_report_blueprint_versions;
drop policy if exists "manager_delete_extract_report_blueprint_versions" on public.extract_report_blueprint_versions;
create policy "manager_insert_extract_report_blueprint_versions" on public.extract_report_blueprint_versions
for insert to authenticated
with check (
  exists (
    select 1
    from public.extract_report_blueprints bp
    where bp.id = blueprint_id
      and public.can_manage_project(bp.project_id)
  )
);
create policy "manager_delete_extract_report_blueprint_versions" on public.extract_report_blueprint_versions
for delete to authenticated
using (
  exists (
    select 1
    from public.extract_report_blueprints bp
    where bp.id = blueprint_id
      and public.can_manage_project(bp.project_id)
  )
);
