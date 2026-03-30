# Handbook Sample Seed Guide

## Muc tieu

Tai lieu nay huong dan nap du lieu mau vao cac bang `handbook_*` de test nhanh module handbook moi tren Supabase ma khong dong vao 2 he thong dang chay.

## File seed

- `supabase/handbook_seed_sample.sql`

## Pham vi an toan

File seed chi ghi vao:

- `handbook_nodes`
- `handbook_notices`
- `handbook_settings`

Khong ghi vao:

- So tay cu
- He thong du lieu hien hanh
- cac bang du an / bieu mau / bao cao / import cua he thong dang chay

## Cach nap seed

1. Chạy trước file `supabase/handbook_schema.sql` trong `SQL Editor` để tạo toàn bộ bảng `handbook_*`.\r\n2. Mở Supabase project.
3. Vào `SQL Editor`.
4. Tạo `New query`.
5. Copy toàn bộ nội dung file `supabase/handbook_seed_sample.sql`.
6. Bấm `Run`.

## Ket qua mong doi

Sau khi chay xong, module handbook moi se co du lieu de test:

- HomePage co summary section
- HomePage co notices
- Quy dinh co 1 node cha + 1 node con
- Hoi dap co 1 node mau
- Bieu mau co 1 node mau co file URL
- Tai lieu co 1 node mau co PDF refs
- Admin handbook moi co du lieu de kiem tra CRUD co ban

## Neu muon xoa du lieu mau

Co the xoa theo ID mau:

- `sample_quydinh_root_01`
- `sample_quydinh_child_01`
- `sample_hoidap_root_01`
- `sample_bieumau_root_01`
- `sample_tailieu_root_01`
- `sample_notice_01`
- `sample_notice_02`
- `sample_home_config`

Hoac viet query xoa rieng theo tien to `sample_`.

## Luu y

- Day la du lieu test handbook moi.
- Khong thay the du lieu migration that tu `treeData`.
- Khi co du lieu export that, uu tien quy trinh:
  1. `npm run handbook:flatten`
  2. review file review
  3. `npm run handbook:import`

