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

drop policy if exists "auth_read_department_members" on public.department_members;
drop policy if exists "scoped_read_department_members" on public.department_members;
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

drop policy if exists "public_read_consolidated_rows" on public.consolidated_rows;
drop policy if exists "auth_read_consolidated_rows" on public.consolidated_rows;
drop policy if exists "auth_insert_consolidated_rows" on public.consolidated_rows;
drop policy if exists "auth_update_consolidated_rows" on public.consolidated_rows;

create policy "scoped_read_consolidated_rows" on public.consolidated_rows
for select to authenticated
using (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_insert_consolidated_rows" on public.consolidated_rows
for insert to authenticated
with check (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_update_consolidated_rows" on public.consolidated_rows
for update to authenticated
using (public.can_access_project_unit(project_id, unit_code))
with check (public.can_access_project_unit(project_id, unit_code));

drop policy if exists "public_read_data_files" on public.data_files;
drop policy if exists "auth_read_data_files" on public.data_files;
drop policy if exists "auth_insert_data_files" on public.data_files;
drop policy if exists "auth_update_data_files" on public.data_files;

create policy "scoped_read_data_files" on public.data_files
for select to authenticated
using (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_insert_data_files" on public.data_files
for insert to authenticated
with check (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_update_data_files" on public.data_files
for update to authenticated
using (public.can_access_project_unit(project_id, unit_code))
with check (public.can_access_project_unit(project_id, unit_code));

drop policy if exists "auth_read_report_exports" on public.report_exports;
drop policy if exists "auth_insert_report_exports" on public.report_exports;

create policy "scoped_read_report_exports" on public.report_exports
for select to authenticated
using (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_insert_report_exports" on public.report_exports
for insert to authenticated
with check (public.can_access_project_unit(project_id, unit_code));

drop policy if exists "auth_read_analysis_cells" on public.analysis_cells;
drop policy if exists "auth_insert_analysis_cells" on public.analysis_cells;
drop policy if exists "auth_update_analysis_cells" on public.analysis_cells;

create policy "scoped_read_analysis_cells" on public.analysis_cells
for select to authenticated
using (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_insert_analysis_cells" on public.analysis_cells
for insert to authenticated
with check (public.can_access_project_unit(project_id, unit_code));

create policy "scoped_update_analysis_cells" on public.analysis_cells
for update to authenticated
using (public.can_access_project_unit(project_id, unit_code))
with check (public.can_access_project_unit(project_id, unit_code));

drop policy if exists "auth_read_ai_analysis_reports" on public.ai_analysis_reports;
drop policy if exists "auth_insert_ai_analysis_reports" on public.ai_analysis_reports;
drop policy if exists "auth_update_ai_analysis_reports" on public.ai_analysis_reports;

create policy "admin_read_ai_analysis_reports" on public.ai_analysis_reports
for select to authenticated
using (public.is_admin_user());

create policy "admin_insert_ai_analysis_reports" on public.ai_analysis_reports
for insert to authenticated
with check (public.is_admin_user());

create policy "admin_update_ai_analysis_reports" on public.ai_analysis_reports
for update to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());
