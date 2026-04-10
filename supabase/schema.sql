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

create table if not exists project_units (
  project_id text not null references projects(id) on delete cascade,
  unit_code text not null references units(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, unit_code)
);

create index if not exists idx_project_units_unit_code on project_units(unit_code);

create table if not exists app_settings (
  id text primary key,
  one_drive_link text not null default '',
  storage_path text not null default '',
  received_path text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  email text primary key,
  auth_user_id uuid,
  display_name text not null,
  role text not null default 'contributor' check (role in ('admin', 'contributor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists idx_user_profiles_active on user_profiles(is_active);
create index if not exists idx_user_profiles_auth_user_id on user_profiles(auth_user_id);

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where email = auth.email()
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where email = auth.email()
      and is_active = true
  );
$$;

create or replace function public.guard_user_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() = old.email and not public.is_admin_user() then
    if new.email is distinct from old.email
       or new.display_name is distinct from old.display_name
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.created_at is distinct from old.created_at then
      raise exception 'Ban khong co quyen thay doi phan quyen tai khoan nay.';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_guard_user_profiles on user_profiles;
create trigger trg_guard_user_profiles
before update on user_profiles
for each row
execute function public.guard_user_profile_update();

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

create table if not exists global_assignments (
  id text primary key,
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

create or replace function public.get_report_row_totals(
  p_project_id text,
  p_template_id text,
  p_year text,
  p_unit_code text default null
)
returns table (
  source_row integer,
  label text,
  row_values jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_rows as (
    select
      r.source_row,
      r.label,
      r.values
    from public.consolidated_rows r
    where r.project_id = p_project_id
      and r.template_id = p_template_id
      and r.year = p_year
      and (
        p_unit_code is null
        or p_unit_code = ''
        or p_unit_code = '__TOTAL_CITY__'
        or r.unit_code = p_unit_code
      )
  ),
  expanded_values as (
    select
      fr.source_row,
      max(fr.label) as label,
      value_item.ordinality - 1 as value_index,
      sum(coalesce(nullif(value_item.value, '')::numeric, 0)) as total_value
    from filtered_rows fr
    cross join lateral jsonb_array_elements_text(coalesce(fr.values, '[]'::jsonb)) with ordinality as value_item(value, ordinality)
    group by fr.source_row, value_item.ordinality
  )
  select
    ev.source_row,
    max(ev.label) as label,
    jsonb_agg(to_jsonb(coalesce(ev.total_value, 0)) order by ev.value_index) as row_values
  from expanded_values ev
  group by ev.source_row
  order by ev.source_row;
$$;

create or replace function public.get_report_cell_details(
  p_project_id text,
  p_template_id text,
  p_year text,
  p_source_row integer,
  p_value_index integer,
  p_unit_code text default null
)
returns table (
  unit_code text,
  unit_name text,
  value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered_rows as (
    select
      r.unit_code,
      coalesce(u.name, df.unit_name, r.unit_code) as unit_name,
      coalesce(nullif(r.values ->> p_value_index, '')::numeric, 0) as value
    from public.consolidated_rows r
    left join public.units u on u.code = r.unit_code
    left join public.data_files df
      on df.project_id = r.project_id
     and df.unit_code = r.unit_code
     and df.year = r.year
    where r.project_id = p_project_id
      and r.template_id = p_template_id
      and r.year = p_year
      and r.source_row = p_source_row
      and (
        p_unit_code is null
        or p_unit_code = ''
        or p_unit_code = '__TOTAL_CITY__'
        or r.unit_code = p_unit_code
      )
  )
  select
    fr.unit_code,
    max(fr.unit_name) as unit_name,
    sum(fr.value) as value
  from filtered_rows fr
  group by fr.unit_code
  order by fr.unit_code;
$$;

grant execute on function public.get_report_row_totals(text, text, text, text) to anon, authenticated;
grant execute on function public.get_report_cell_details(text, text, text, integer, integer, text) to anon, authenticated;

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

insert into user_profiles (email, display_name, role, is_active)
values
  ('admin@sotay.com', 'LÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬nh KiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªn', 'admin', true),
  ('trieuthingoc@sotay.com', 'TriÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡u ThÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ NgÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âc', 'contributor', true),
  ('tranthikieuanh@sotay.com', 'TrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§n ThÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ KiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âu Anh', 'contributor', true),
  ('tranphuongha@sotay.com', 'TrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§n PhÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ng HÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ', 'contributor', true),
  ('phamthithuhanh@sotay.com', 'PhÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡m ThÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ Thu HÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂºÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡nh', 'contributor', true),
  ('nguyenthugiang@sotay.com', 'NguyÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦n Thu Giang', 'contributor', true),
  ('nguyensinghiem@sotay.com', 'NguyÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦n SÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© NghiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªm', 'contributor', true),
  ('nguyenhuuhung@sotay.com', 'NguyÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦n HÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯u HÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ng', 'contributor', true)
on conflict (email) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();

alter table projects enable row level security;
alter table templates enable row level security;
alter table units enable row level security;
alter table app_settings enable row level security;
alter table user_profiles enable row level security;
alter table assignments enable row level security;
alter table global_assignments enable row level security;
alter table project_units enable row level security;
alter table consolidated_rows enable row level security;
alter table data_files enable row level security;
alter table report_exports enable row level security;

drop policy if exists "public_read_projects" on projects;
drop policy if exists "auth_read_projects" on projects;
drop policy if exists "auth_write_projects" on projects;
drop policy if exists "admin_insert_projects" on projects;
drop policy if exists "admin_update_projects" on projects;
drop policy if exists "admin_delete_projects" on projects;
create policy "public_read_projects" on projects for select using (true);
create policy "auth_read_projects" on projects for select to authenticated using (public.is_active_user());
create policy "admin_insert_projects" on projects for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_projects" on projects for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_projects" on projects for delete to authenticated using (public.is_admin_user());

drop policy if exists "public_read_templates" on templates;
drop policy if exists "auth_read_templates" on templates;
drop policy if exists "auth_write_templates" on templates;
drop policy if exists "admin_insert_templates" on templates;
drop policy if exists "admin_update_templates" on templates;
drop policy if exists "admin_delete_templates" on templates;
create policy "public_read_templates" on templates for select using (true);
create policy "auth_read_templates" on templates for select to authenticated using (public.is_active_user());
create policy "admin_insert_templates" on templates for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_templates" on templates for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_templates" on templates for delete to authenticated using (public.is_admin_user());

drop policy if exists "public_read_units" on units;
drop policy if exists "auth_read_units" on units;
create policy "public_read_units" on units for select using (true);
create policy "auth_read_units" on units for select to authenticated using (public.is_active_user());
drop policy if exists "auth_write_units" on units;
drop policy if exists "admin_insert_units" on units;
drop policy if exists "admin_update_units" on units;
drop policy if exists "admin_delete_units" on units;
create policy "admin_insert_units" on units for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_units" on units for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_units" on units for delete to authenticated using (public.is_admin_user());

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

drop policy if exists "auth_read_settings" on app_settings;
create policy "auth_read_settings" on app_settings for select to authenticated using (public.is_active_user());
drop policy if exists "auth_write_settings" on app_settings;
drop policy if exists "admin_insert_settings" on app_settings;
drop policy if exists "admin_update_settings" on app_settings;
drop policy if exists "admin_delete_settings" on app_settings;
create policy "admin_insert_settings" on app_settings for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_settings" on app_settings for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_settings" on app_settings for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_user_profiles" on user_profiles;
create policy "auth_read_user_profiles" on user_profiles for select to authenticated using (public.is_active_user());
drop policy if exists "admin_insert_user_profiles" on user_profiles;
create policy "admin_insert_user_profiles" on user_profiles
for insert to authenticated
with check (public.is_admin_user());
drop policy if exists "admin_update_user_profiles" on user_profiles;
create policy "admin_update_user_profiles" on user_profiles
for update to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());
drop policy if exists "admin_delete_user_profiles" on user_profiles;
create policy "admin_delete_user_profiles" on user_profiles
for delete to authenticated
using (public.is_admin_user());
drop policy if exists "self_touch_user_profiles" on user_profiles;
create policy "self_touch_user_profiles" on user_profiles
for update to authenticated
using (auth.email() = email)
with check (auth.email() = email);

drop policy if exists "auth_read_assignments" on assignments;
create policy "auth_read_assignments" on assignments for select to authenticated using (public.is_active_user());
drop policy if exists "auth_write_assignments" on assignments;
drop policy if exists "admin_insert_assignments" on assignments;
drop policy if exists "admin_update_assignments" on assignments;
drop policy if exists "admin_delete_assignments" on assignments;
create policy "admin_insert_assignments" on assignments for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_assignments" on assignments for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_assignments" on assignments for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_global_assignments" on global_assignments;
drop policy if exists "admin_insert_global_assignments" on global_assignments;
drop policy if exists "admin_update_global_assignments" on global_assignments;
drop policy if exists "admin_delete_global_assignments" on global_assignments;
create policy "auth_read_global_assignments" on global_assignments for select to authenticated using (public.is_active_user());
create policy "admin_insert_global_assignments" on global_assignments for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_global_assignments" on global_assignments for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_global_assignments" on global_assignments for delete to authenticated using (public.is_admin_user());

drop policy if exists "public_read_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_read_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_write_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_insert_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_update_consolidated_rows" on consolidated_rows;
drop policy if exists "admin_delete_consolidated_rows" on consolidated_rows;
create policy "public_read_consolidated_rows" on consolidated_rows for select using (true);
create policy "auth_read_consolidated_rows" on consolidated_rows for select to authenticated using (public.is_active_user());
create policy "auth_insert_consolidated_rows" on consolidated_rows for insert to authenticated with check (public.is_active_user());
create policy "auth_update_consolidated_rows" on consolidated_rows for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "admin_delete_consolidated_rows" on consolidated_rows for delete to authenticated using (public.is_admin_user());

drop policy if exists "public_read_data_files" on data_files;
drop policy if exists "auth_read_data_files" on data_files;
drop policy if exists "auth_write_data_files" on data_files;
drop policy if exists "auth_insert_data_files" on data_files;
drop policy if exists "auth_update_data_files" on data_files;
drop policy if exists "admin_delete_data_files" on data_files;
create policy "public_read_data_files" on data_files for select using (true);
create policy "auth_read_data_files" on data_files for select to authenticated using (public.is_active_user());
create policy "auth_insert_data_files" on data_files for insert to authenticated with check (public.is_active_user());
create policy "auth_update_data_files" on data_files for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "admin_delete_data_files" on data_files for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_report_exports" on report_exports;
create policy "auth_read_report_exports" on report_exports for select to authenticated using (public.is_active_user());
drop policy if exists "auth_write_report_exports" on report_exports;
drop policy if exists "auth_insert_report_exports" on report_exports;
drop policy if exists "admin_update_report_exports" on report_exports;
drop policy if exists "admin_delete_report_exports" on report_exports;
create policy "auth_insert_report_exports" on report_exports for insert to authenticated with check (public.is_active_user());
create policy "admin_update_report_exports" on report_exports for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_report_exports" on report_exports for delete to authenticated using (public.is_admin_user());

create table if not exists extract_report_blueprints (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
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