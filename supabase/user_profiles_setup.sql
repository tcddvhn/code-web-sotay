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

insert into user_profiles (email, display_name, role, is_active)
values
  ('admin@sotay.com', 'Lê Đình Kiên', 'admin', true),
  ('trieuthingoc@sotay.com', 'Triệu Thị Ngọc', 'contributor', true),
  ('tranthikieuanh@sotay.com', 'Trần Thị Kiều Anh', 'contributor', true),
  ('tranphuongha@sotay.com', 'Trần Phương Hà', 'contributor', true),
  ('phamthithuhanh@sotay.com', 'Phạm Thị Thu Hạnh', 'contributor', true),
  ('nguyenthugiang@sotay.com', 'Nguyễn Thu Giang', 'contributor', true),
  ('nguyensinghiem@sotay.com', 'Nguyễn Sĩ Nghiêm', 'contributor', true),
  ('nguyenhuuhung@sotay.com', 'Nguyễn Hữu Hùng', 'contributor', true)
on conflict (email) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();

alter table user_profiles enable row level security;

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
