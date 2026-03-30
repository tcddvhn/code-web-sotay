-- Seed sample data for handbook preview.
-- Safe scope: only touches handbook_* tables.
-- Recommended for local / staging preview of the new handbook module.

insert into handbook_nodes (
  id,
  legacy_id,
  parent_id,
  section,
  title,
  slug,
  tag,
  summary_html,
  detail_html,
  sort_order,
  level,
  file_url,
  file_name,
  pdf_refs,
  force_accordion,
  is_published,
  updated_by
)
values
  (
    'sample_quydinh_root_01',
    'sample_quydinh_root_01',
    null,
    'quy-dinh',
    'Những điểm cần nhớ khi tiếp nhận hồ sơ đảng viên',
    'nhung-diem-can-nho-khi-tiep-nhan-ho-so-dang-vien',
    'quy định nền tảng',
    '<p>Tài liệu tóm tắt các nguyên tắc chung khi tiếp nhận, kiểm tra và hoàn thiện hồ sơ.</p>',
    '<p>Nội dung mẫu cho thấy module handbook mới đã có thể đọc HTML chi tiết từ Supabase.</p><ul><li>Kiểm tra đủ thành phần hồ sơ.</li><li>Đối chiếu biểu mẫu mới nhất.</li><li>Ghi nhận mốc thời gian và đơn vị phụ trách.</li></ul>',
    0,
    0,
    null,
    null,
    '[{"doc":"hd01","page":12}]'::jsonb,
    false,
    true,
    'seed_sample'
  ),
  (
    'sample_quydinh_child_01',
    'sample_quydinh_child_01',
    'sample_quydinh_root_01',
    'quy-dinh',
    'Kiểm tra thành phần hồ sơ',
    'kiem-tra-thanh-phan-ho-so',
    'quy định hồ sơ',
    '<p>Danh mục kiểm tra nhanh trước khi lưu hồ sơ.</p>',
    '<p>Cần đối chiếu ảnh, quyết định, mẫu biểu và các văn bản liên quan trước khi xác nhận hồ sơ hợp lệ.</p>',
    0,
    1,
    null,
    null,
    '[]'::jsonb,
    false,
    true,
    'seed_sample'
  ),
  (
    'sample_hoidap_root_01',
    'sample_hoidap_root_01',
    null,
    'hoi-dap',
    'Khi nào phải bổ sung xác nhận của cấp ủy?',
    'khi-nao-phai-bo-sung-xac-nhan-cua-cap-uy',
    'hỏi đáp thường gặp',
    '<p>Tình huống nghiệp vụ thường phát sinh khi rà soát hồ sơ.</p>',
    '<p>Trường hợp hồ sơ có thay đổi về nơi sinh hoạt hoặc thiếu xác nhận tại mốc chuyển giao thì cần bổ sung ý kiến của cấp ủy liên quan.</p>',
    0,
    0,
    null,
    null,
    '[]'::jsonb,
    false,
    true,
    'seed_sample'
  ),
  (
    'sample_bieumau_root_01',
    'sample_bieumau_root_01',
    null,
    'bieu-mau',
    'Mẫu báo cáo rà soát hồ sơ cuối quý',
    'mau-bao-cao-ra-soat-ho-so-cuoi-quy',
    'biểu mẫu dùng chung',
    '<p>Biểu mẫu mẫu để tải về và hoàn thiện theo quý.</p>',
    '<p>File biểu mẫu có thể gắn vào handbook để người dùng tra cứu nhanh mà không cần vào hệ thống dữ liệu.</p>',
    0,
    0,
    'https://example.com/sample-bieumau.xlsx',
    'sample-bieumau.xlsx',
    '[]'::jsonb,
    false,
    true,
    'seed_sample'
  ),
  (
    'sample_tailieu_root_01',
    'sample_tailieu_root_01',
    null,
    'tai-lieu',
    'Tài liệu hướng dẫn nhập dữ liệu cơ sở',
    'tai-lieu-huong-dan-nhap-du-lieu-co-so',
    'tài liệu nghiệp vụ',
    '<p>Tài liệu nền để tập huấn và đối chiếu khi nhập dữ liệu.</p>',
    '<p>Đây là ví dụ cho section Tài liệu, có thể gắn file PDF hoặc đường dẫn tham khảo bên ngoài.</p>',
    0,
    0,
    'https://example.com/tai-lieu-huong-dan.pdf',
    'tai-lieu-huong-dan.pdf',
    '[{"doc":"tailieu01","page":3},{"doc":"tailieu01","page":4}]'::jsonb,
    false,
    true,
    'seed_sample'
  )
on conflict (id) do update set
  legacy_id = excluded.legacy_id,
  parent_id = excluded.parent_id,
  section = excluded.section,
  title = excluded.title,
  slug = excluded.slug,
  tag = excluded.tag,
  summary_html = excluded.summary_html,
  detail_html = excluded.detail_html,
  sort_order = excluded.sort_order,
  level = excluded.level,
  file_url = excluded.file_url,
  file_name = excluded.file_name,
  pdf_refs = excluded.pdf_refs,
  force_accordion = excluded.force_accordion,
  is_published = excluded.is_published,
  updated_at = now(),
  updated_by = excluded.updated_by;

insert into handbook_notices (
  id,
  title,
  content,
  published_at,
  is_published,
  created_by
)
values
  (
    'sample_notice_01',
    'Đã sẵn sàng test handbook mới trên Supabase',
    'Bộ dữ liệu mẫu đã được chuẩn bị để kiểm tra HomePage, section pages, tìm kiếm và admin handbook mới.',
    now(),
    true,
    'seed_sample'
  ),
  (
    'sample_notice_02',
    'Lưu ý: handbook mới tách biệt với 2 hệ thống đang chạy',
    'Mọi dữ liệu mẫu trong gói seed này chỉ nằm trong các bảng handbook_* và không can thiệp vào Sổ tay cũ hoặc Hệ thống dữ liệu hiện hành.',
    now(),
    true,
    'seed_sample'
  )
on conflict (id) do update set
  title = excluded.title,
  content = excluded.content,
  published_at = excluded.published_at,
  is_published = excluded.is_published,
  updated_at = now(),
  created_by = excluded.created_by;

insert into handbook_settings (id, key, value, updated_by)
values (
  'sample_home_config',
  'home.hero',
  '{"badge":"Sổ tay nghiệp vụ mới","cta":"Bắt đầu tra cứu"}'::jsonb,
  'seed_sample'
)
on conflict (id) do update set
  key = excluded.key,
  value = excluded.value,
  updated_at = now(),
  updated_by = excluded.updated_by;
