insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', true, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "public_read_uploads" on storage.objects;
create policy "public_read_uploads"
on storage.objects
for select
using (bucket_id = 'uploads');

drop policy if exists "auth_insert_uploads" on storage.objects;
create policy "auth_insert_uploads"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'uploads' and public.is_active_user());

drop policy if exists "auth_update_uploads" on storage.objects;
drop policy if exists "admin_update_uploads" on storage.objects;
create policy "admin_update_uploads"
on storage.objects
for update
to authenticated
using (bucket_id = 'uploads' and public.is_admin_user())
with check (bucket_id = 'uploads' and public.is_admin_user());

drop policy if exists "auth_delete_uploads" on storage.objects;
drop policy if exists "admin_delete_uploads" on storage.objects;
create policy "admin_delete_uploads"
on storage.objects
for delete
to authenticated
using (bucket_id = 'uploads' and public.is_admin_user());
