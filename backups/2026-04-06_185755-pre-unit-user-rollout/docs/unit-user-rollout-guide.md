# Unit User Rollout Guide

## Muc tieu
- 132 tai khoan don vi dang nhap va tu nop file du lieu cho chinh don vi cua minh.
- Menu cua tai khoan don vi chi con: Dashboard, Tiep nhan du lieu, Bao cao.
- Ghi de du lieu chi duoc thuc hien sau khi admin phe duyet.

## Nhung gi da duoc code xong
- Role moi `unit_user` trong frontend typings va auth mapping.
- Sidebar an cac menu quan tri voi `unit_user`.
- Dashboard va Bao cao tu dong khoa theo `unit_code` cua tai khoan dang nhap.
- Intake (`ImportFiles`) cho `unit_user`:
  - chi cho chon 1 file
  - an nut chon thu muc
  - tu dong gan don vi theo tai khoan dang nhap
  - neu don vi da co du lieu thi tao `data_overwrite_requests` thay vi ghi de truc tiep
- Admin co khung phe duyet ghi de ngay trong man `Tiep nhan du lieu`.

## Viec can chay tren Supabase
1. Chay file SQL:
   - `C:\CODE_APPWEB\supabase\unit_user_rollout.sql`
2. Dong bo 132 tai khoan vao `user_profiles`:
   - dry-run:
     - `npm.cmd run auth:sync-unit-profiles -- --dry-run`
   - chay that:
     - `npm.cmd run auth:sync-unit-profiles`

## Bien moi truong can co khi chay script
- `SUPABASE_SERVICE_ROLE_KEY`
- Neu khong dat `SUPABASE_URL` thi script mac dinh dung project `https://taivkgwwinakcoxhquyv.supabase.co`

## Thu tu rollout de xuat
1. Chay SQL rollout.
2. Chay sync `user_profiles`.
3. Dang nhap thu bang 1 tai khoan don vi.
4. Kiem tra 3 menu: Dashboard / Tiep nhan du lieu / Bao cao.
5. Thu nop file moi.
6. Thu nop file ghi de de xem co tao yeu cau phe duyet hay khong.
7. Dang nhap admin va phe duyet 1 yeu cau ghi de.

## Luu y backend
- Luong ghi de hien duoc chan o UI va dua qua `data_overwrite_requests` de admin duyet.
- Chua khoa hoan toan insert/update `consolidated_rows` o muc RLS cho case overwrite vi he thong hien van can public read cho module bao cao. Neu can khoa sat hon, phai tach them luong RPC/server-side cho import.
