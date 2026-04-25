# Cấp Tài Khoản Nội Bộ Qua Supabase Auth

## Mục tiêu

- Giữ nguyên giao diện tạo tài khoản trong `Cài đặt`.
- Khi admin chọn tạo tài khoản đăng nhập, hệ thống sẽ:
  - tạo user trên `Supabase Auth`
  - đồng bộ `user_profiles`
  - đặt mật khẩu mặc định `btctuhn@456`
  - `email_confirm: true`
  - buộc user đổi mật khẩu ở lần đăng nhập đầu.
- Khi người dùng quên mật khẩu, admin có thể:
  - đặt lại về mật khẩu mặc định `btctuhn@456`
  - bật lại cờ bắt buộc đổi mật khẩu cho lần đăng nhập tiếp theo.

## File liên quan

- SQL rollout: [supabase/internal_auth_provisioning.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/internal_auth_provisioning.sql)
- Edge Function: [supabase/functions/admin-provision-internal-user/index.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/functions/admin-provision-internal-user/index.ts)
- Edge Function reset mật khẩu: [supabase/functions/admin-reset-internal-password/index.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/functions/admin-reset-internal-password/index.ts)
- Frontend:
  - [src/supabase.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/supabase.ts)
  - [src/supabaseStore.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/supabaseStore.ts)
  - [src/App.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx)

## Các bước rollout production

1. Chạy SQL [supabase/internal_auth_provisioning.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/internal_auth_provisioning.sql) trên Supabase SQL Editor.
2. Tạo/deploy Edge Function `admin-provision-internal-user`.
3. Tạo/deploy Edge Function `admin-reset-internal-password`.
4. Deploy web app mới.
5. Vào `Cài đặt -> Quản trị tài khoản nội bộ`.
6. Tạo một tài khoản với tùy chọn:
   - `Tạo luôn tài khoản đăng nhập trên Supabase Auth`
7. Đăng nhập thử bằng:
   - email vừa tạo
   - mật khẩu mặc định `btctuhn@456`
8. Xác nhận hệ thống mở modal bắt buộc đổi mật khẩu trước khi dùng app.
9. Thử dùng nút `Đặt lại mật khẩu` cho một tài khoản đã có login để xác nhận luồng reset hoạt động đúng.

## Kỳ vọng sau rollout

- Admin có thể lưu hồ sơ nội bộ như trước.
- Admin có thể cấp login thật cho tài khoản nội bộ ngay trong giao diện.
- Admin có thể đặt lại mật khẩu cho tài khoản nội bộ ngay trong giao diện.
- `user_profiles.auth_user_id` và `must_change_password` được đồng bộ đúng.
- User mới đăng nhập lần đầu sẽ bị buộc đổi mật khẩu.
- User bị reset mật khẩu cũng sẽ bị buộc đổi mật khẩu ở lần đăng nhập kế tiếp.
