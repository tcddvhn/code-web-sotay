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
