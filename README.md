# HỆ THỐNG QUẢN TRỊ DỮ LIỆU TCĐ, ĐV TẬP TRUNG

Ứng dụng web dùng để tiếp nhận, chuẩn hóa, tổng hợp và theo dõi dữ liệu báo cáo từ các file Excel của đơn vị. Hệ thống hiện đã thống nhất trên nền tảng Supabase cho xác thực, dữ liệu và lưu trữ file.

## Tính năng chính

- Tiếp nhận dữ liệu từ nhiều file Excel theo biểu mẫu đã phát hành.
- Học biểu mẫu bằng AI hoặc thiết lập thủ công.
- Quản lý dự án, biểu mẫu, năm báo cáo và dữ liệu tiếp nhận.
- Phân quyền tài khoản quản trị và tài khoản tiếp nhận dữ liệu qua `user_profiles`.
- Phân công người theo dõi đơn vị theo từng dự án.
- Tổng hợp báo cáo và xuất file Excel theo cấu trúc mẫu.
- Lưu lịch sử xuất báo cáo để theo dõi và xóa khi cần.
- Quản lý danh mục đơn vị toàn hệ thống, hỗ trợ xóa mềm và khôi phục.

## Công nghệ sử dụng

- Frontend: React 19, TypeScript, Vite
- Giao diện: Tailwind CSS 4
- Biểu đồ: Recharts
- Xác thực, cơ sở dữ liệu, lưu file: Supabase
- Xử lý Excel: SheetJS (`xlsx`)
- AI phân tích biểu mẫu: Google Gemini

## Cài đặt local

1. Cài dependencies:

```bash
npm install
```

2. Tạo file `.env` từ `.env.example` và khai báo:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_SUPABASE_BUCKET=uploads
VITE_SUPABASE_ROOT_FOLDER=app_data
```

3. Áp dụng schema Supabase trong file [supabase/schema.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/schema.sql).
Nếu project đã có dữ liệu và chỉ cần cập nhật quyền, chạy thêm:
- [supabase/user_profiles_setup.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/user_profiles_setup.sql)
- [supabase/rls_hardening.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/rls_hardening.sql)
- [supabase/storage_setup.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/storage_setup.sql)

4. Chạy ứng dụng:

```bash
npm run dev
```

Mặc định ứng dụng chạy tại `http://localhost:3000`.

## Ghi chú Supabase

- Bảng `user_profiles` là nguồn sự thật cho quyền truy cập, tên hiển thị và vai trò người dùng.
- Chỉ tài khoản có `is_active = true` trong `user_profiles` mới được phép vào hệ thống.
- Hệ thống tự cập nhật `auth_user_id` và `last_login_at` khi người dùng đăng nhập thành công.
- Cần bật Email/Password Auth trong Supabase Auth cho các tài khoản đã cấp.
- Bucket `uploads` dùng chung cho file mẫu, file tiếp nhận và file xuất báo cáo.
- Policy hiện tại: admin được toàn quyền; user thường được tải file lên nhưng không được xóa/sửa file trên Storage.

## Ghi chú triển khai

- Chức năng AI yêu cầu `VITE_GEMINI_API_KEY` trước khi sử dụng.
- Khi deploy lên Vercel, cần khai báo đầy đủ biến môi trường Supabase và Gemini.
- Sau mỗi lần thay đổi schema hoặc policy, cần áp dụng lại SQL trên Supabase.
