do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_profiles'
  ) then
    raise exception 'Bảng public.user_profiles chưa tồn tại. Hãy rollout user_profiles trước khi chạy file này.';
  end if;
end
$$;

alter table if exists public.user_profiles
  add column if not exists auth_user_id uuid;

alter table if exists public.user_profiles
  add column if not exists last_login_at timestamptz;

alter table if exists public.user_profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.user_profiles.must_change_password is
  'Đánh dấu tài khoản phải đổi mật khẩu ở lần đăng nhập đầu sau khi admin cấp mật khẩu mặc định.';

update public.user_profiles
set must_change_password = false
where must_change_password is null;

create index if not exists idx_user_profiles_auth_user_id
  on public.user_profiles(auth_user_id);

