begin;

-- 1) Chuẩn hóa người cập nhật của blueprint theo user_profiles.
update public.extract_report_blueprints as blueprint
set updated_by_name = profile.display_name
from public.user_profiles as profile
where (
    (profile.auth_user_id is not null and blueprint.updated_by_id = profile.auth_user_id::text)
    or lower(coalesce(blueprint.updated_by_id, '')) = lower(coalesce(profile.email, ''))
  )
  and coalesce(blueprint.updated_by_name, '') is distinct from coalesce(profile.display_name, '');

-- 2) Chuẩn hóa người tạo phiên bản theo user_profiles.
update public.extract_report_blueprint_versions as version
set created_by_name = profile.display_name
from public.user_profiles as profile
where (
    (profile.auth_user_id is not null and version.created_by_id = profile.auth_user_id::text)
    or lower(coalesce(version.created_by_id, '')) = lower(coalesce(profile.email, ''))
  )
  and coalesce(version.created_by_name, '') is distinct from coalesce(profile.display_name, '');

commit;

-- Kiểm tra nhanh sau khi chạy:
select
  id,
  name,
  updated_by_id,
  updated_by_name,
  updated_at
from public.extract_report_blueprints
order by updated_at desc nulls last;

select
  id,
  blueprint_id,
  version_number,
  created_by_id,
  created_by_name,
  created_at
from public.extract_report_blueprint_versions
order by created_at desc nulls last;
