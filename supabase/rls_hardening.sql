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

drop policy if exists "public_read_projects" on projects;
drop policy if exists "auth_read_projects" on projects;
drop policy if exists "auth_write_projects" on projects;
drop policy if exists "admin_insert_projects" on projects;
drop policy if exists "admin_update_projects" on projects;
drop policy if exists "admin_delete_projects" on projects;
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
create policy "auth_read_templates" on templates for select to authenticated using (public.is_active_user());
create policy "admin_insert_templates" on templates for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_templates" on templates for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_templates" on templates for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_units" on units;
drop policy if exists "auth_write_units" on units;
drop policy if exists "admin_insert_units" on units;
drop policy if exists "admin_update_units" on units;
drop policy if exists "admin_delete_units" on units;
create policy "auth_read_units" on units for select to authenticated using (public.is_active_user());
create policy "admin_insert_units" on units for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_units" on units for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_units" on units for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_settings" on app_settings;
drop policy if exists "auth_write_settings" on app_settings;
drop policy if exists "admin_insert_settings" on app_settings;
drop policy if exists "admin_update_settings" on app_settings;
drop policy if exists "admin_delete_settings" on app_settings;
create policy "auth_read_settings" on app_settings for select to authenticated using (public.is_active_user());
create policy "admin_insert_settings" on app_settings for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_settings" on app_settings for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_settings" on app_settings for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_user_profiles" on user_profiles;
drop policy if exists "admin_insert_user_profiles" on user_profiles;
drop policy if exists "admin_update_user_profiles" on user_profiles;
drop policy if exists "admin_delete_user_profiles" on user_profiles;
drop policy if exists "self_touch_user_profiles" on user_profiles;
create policy "auth_read_user_profiles" on user_profiles for select to authenticated using (public.is_active_user());
create policy "admin_insert_user_profiles" on user_profiles for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_user_profiles" on user_profiles for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_user_profiles" on user_profiles for delete to authenticated using (public.is_admin_user());
create policy "self_touch_user_profiles" on user_profiles for update to authenticated using (auth.email() = email) with check (auth.email() = email);

drop policy if exists "auth_read_assignments" on assignments;
drop policy if exists "auth_write_assignments" on assignments;
drop policy if exists "admin_insert_assignments" on assignments;
drop policy if exists "admin_update_assignments" on assignments;
drop policy if exists "admin_delete_assignments" on assignments;
create policy "auth_read_assignments" on assignments for select to authenticated using (public.is_active_user());
create policy "admin_insert_assignments" on assignments for insert to authenticated with check (public.is_admin_user());
create policy "admin_update_assignments" on assignments for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_assignments" on assignments for delete to authenticated using (public.is_admin_user());

drop policy if exists "public_read_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_read_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_write_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_insert_consolidated_rows" on consolidated_rows;
drop policy if exists "auth_update_consolidated_rows" on consolidated_rows;
drop policy if exists "admin_delete_consolidated_rows" on consolidated_rows;
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
create policy "auth_read_data_files" on data_files for select to authenticated using (public.is_active_user());
create policy "auth_insert_data_files" on data_files for insert to authenticated with check (public.is_active_user());
create policy "auth_update_data_files" on data_files for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "admin_delete_data_files" on data_files for delete to authenticated using (public.is_admin_user());

drop policy if exists "auth_read_report_exports" on report_exports;
drop policy if exists "auth_write_report_exports" on report_exports;
drop policy if exists "auth_insert_report_exports" on report_exports;
drop policy if exists "admin_update_report_exports" on report_exports;
drop policy if exists "admin_delete_report_exports" on report_exports;
create policy "auth_read_report_exports" on report_exports for select to authenticated using (public.is_active_user());
create policy "auth_insert_report_exports" on report_exports for insert to authenticated with check (public.is_active_user());
create policy "admin_update_report_exports" on report_exports for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy "admin_delete_report_exports" on report_exports for delete to authenticated using (public.is_admin_user());
