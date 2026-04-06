# Hướng Dẫn Tạo Hàng Loạt Tài Khoản Supabase Auth

Tài liệu này dùng để tạo hàng loạt tài khoản vào:

- `Supabase Dashboard`
- `Authentication`
- `Users`

Áp dụng cho file Excel:

- `C:\Users\ldkie\OneDrive\KIEN_BTCTU\Năm 2026\TONGHOPSOLIEU\Danh_sach_taikhoan.xlsx`

## 1. Cấu trúc file Excel

Script hiện đang đọc các cột:

- `Mã ĐV`
- `Tên đơn vị hiện tại`
- `Tên tài khoản tự động tạo`

Ví dụ:

- `DV001 | Đảng bộ các cơ quan Đảng Thành phố | dbcaccoquandangthanhpho@sotay.com`

## 2. Mật khẩu mặc định

Mặc định script dùng:

- `btctuhn@456`

Có thể override bằng biến môi trường:

- `DEFAULT_IMPORT_PASSWORD`

## 3. Cách lấy service role key

Trong Supabase:

1. vào project
2. vào `Project Settings`
3. vào `API Keys`
4. copy `service_role` hoặc server-side `secret key`

Lưu ý:

- không đưa key này vào frontend
- không commit lên GitHub
- chỉ dùng để chạy local hoặc server-side script

## 4. Script đã chuẩn bị

File:

- `C:\CODE_APPWEB\scripts\import-supabase-auth-users.mjs`

Lệnh npm:

- `npm run auth:import-users`

## 5. Chế độ chạy an toàn trước

Khuyến nghị chạy `dry-run` trước để kiểm tra:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY_CUA_BAN"
npm run auth:import-users -- --dry-run
```

Kết quả sẽ in:

- tổng số dòng hợp lệ
- số tài khoản sẽ tạo
- số tài khoản bị bỏ qua vì đã tồn tại
- số lỗi

## 6. Chạy tạo thật

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY_CUA_BAN"
npm run auth:import-users
```

Nếu muốn chỉ rõ file:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY_CUA_BAN"
npm run auth:import-users -- --file "C:\Users\ldkie\OneDrive\KIEN_BTCTU\Năm 2026\TONGHOPSOLIEU\Danh_sach_taikhoan.xlsx"
```

Nếu muốn override mật khẩu mặc định:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY_CUA_BAN"
$env:DEFAULT_IMPORT_PASSWORD="mat_khau_moi"
npm run auth:import-users
```

## 7. Dữ liệu metadata được gắn vào user

Khi tạo user, script ghi:

- `display_name`
- `unit_code`
- `unit_name`
- `import_source`

Các metadata này nằm trong `user_metadata` của Supabase Auth user.

## 8. Hành vi xử lý trùng

Nếu email đã tồn tại trong Supabase Auth:

- script không tạo lại
- ghi vào danh sách `Bỏ qua`

## 9. Phạm vi script

Script hiện chỉ làm:

- tạo user trong Supabase Auth

Script chưa làm:

- tạo profile nghiệp vụ khác ngoài Auth
- gán role vào bảng riêng của hệ thống
- gửi email mời / reset password

Nếu cần các bước đó, phải triển khai riêng và cập nhật vào `docs/`.

## 10. Checklist sau khi bấm `Disable JWT-based API keys`

Sau khi tắt legacy JWT-based API keys, các chỗ sau phải dùng key mới đúng loại:

### 10.1. Trong repo hiện tại

#### A. Frontend runtime

File:

- `C:\CODE_APPWEB\src\supabase.ts`

Hiện trạng:

- frontend đang dùng `VITE_SUPABASE_PUBLISHABLE_KEY`
- nếu biến môi trường không có, file này fallback sang một `sb_publishable_...` hardcode

Việc cần làm:

- xác nhận key hardcode hoặc biến `VITE_SUPABASE_PUBLISHABLE_KEY` là **publishable key mới**
- nếu đã đổi publishable key trong Supabase, phải cập nhật ít nhất một trong hai chỗ:
  - `C:\CODE_APPWEB\.env`
  - hoặc cấu hình deploy như Vercel
- nếu muốn an toàn hơn, nên bỏ fallback hardcode trong code và bắt buộc lấy từ env

#### B. Script admin local

File:

- `C:\CODE_APPWEB\scripts\import-supabase-auth-users.mjs`

Hiện trạng:

- script đang đọc `SUPABASE_SERVICE_ROLE_KEY`

Việc cần làm:

- khi đã dùng secret key mới, chỉ cần set biến môi trường bằng key mới
- không cần sửa code script

#### C. Tài liệu và ví dụ lệnh

File:

- `C:\CODE_APPWEB\.env.example`
- `C:\CODE_APPWEB\README.md`
- `C:\CODE_APPWEB\docs\supabase-auth-bulk-import-guide.md`

Hiện trạng:

- đây là nơi ghi tài liệu / mẫu cấu hình

Việc cần làm:

- không cần dán key thật vào đây
- chỉ cần đảm bảo tài liệu nhắc đúng loại key:
  - frontend: publishable key
  - script admin: secret key / service role kiểu server-side

### 10.2. Ngoài repo nhưng bắt buộc phải tự kiểm tra

Tôi không đọc được các nơi ngoài repo. Bạn phải tự rà:

#### A. Vercel Environment Variables

Kiểm tra:

- `VITE_SUPABASE_PUBLISHABLE_KEY`
- có tồn tại key cũ không

Nếu có:

- thay bằng publishable key mới nếu bạn đã rotate / đổi publishable key

#### B. Máy khác / terminal history / file ghi chú

Kiểm tra:

- PowerShell history
- batch script
- ghi chú local
- file `.env` ngoài repo

Nếu có key cũ:

- xóa hoặc thay bằng key mới

#### C. Supabase Edge Functions / server riêng / cron job

Nếu bạn có:

- Edge Function
- server Node riêng
- scheduled task
- tool import ngoài repo

thì phải thay key cũ ở đó bằng:

- secret key mới

### 10.3. Kết luận an toàn

Chỉ bấm `Disable JWT-based API keys` khi bạn chắc chắn:

1. frontend đang dùng publishable key mới hoặc publishable key hợp lệ hiện hành
2. script admin local đang dùng secret key mới
3. không còn nơi nào ngoài repo dùng legacy `service_role`
