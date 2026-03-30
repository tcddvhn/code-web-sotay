# Handbook Worklog

## Nguyen tac lam viec da chot

1. Tuyet doi khong dong vao 2 he thong dang chay:
   - So tay hien hanh
   - He thong du lieu hien hanh
2. Neu co nguy co phai can thiep vao 2 he thong nay, phai bao cao va cho user phe duyet truoc khi thuc hien.
3. Moi thay doi, ke hoach tiep theo va cac buoc trien khai handbook moi deu phai duoc ghi lai trong thu muc `docs/` de co the tiep tuc o may khac.

## Moc ngay 2026-03-30

### Tai lieu da doc lai

- `docs/handbook-rebuild-plan.md`
- `docs/handbook-migration-plan.md`
- `docs/handbook-handoff.md`
- `supabase/handbook_schema.sql`
- toan bo `src/handbook/`

### Tinh trang truoc khi sua

- `src/handbook/` moi o muc shell preview.
- Chua co service doc du lieu that tu Supabase.
- Chua co pages tach rieng cho Home / Quy dinh / Hoi dap / Bieu mau / Tai lieu / Search.
- Da co `scripts/flatten-handbook-export.ts` nhung chua co script import nguoc vao Supabase.

### Viec da trien khai trong dot nay

1. Noi `HandbookShell` vao du lieu that tu Supabase:
   - tao `src/handbook/services/handbookContent.ts`
   - tao `src/handbook/services/handbookSearch.ts`
   - tao `src/handbook/services/handbookStats.ts`
2. Tao bo pages doc noi dung handbook:
   - `src/handbook/pages/HomePage.tsx`
   - `src/handbook/pages/RegulationsPage.tsx`
   - `src/handbook/pages/FaqPage.tsx`
   - `src/handbook/pages/FormsPage.tsx`
   - `src/handbook/pages/DocumentsPage.tsx`
   - `src/handbook/pages/SearchPage.tsx`
   - `src/handbook/pages/SectionPage.tsx`
3. Chuan hoa lai file handbook co san:
   - `src/handbook/config.ts`
   - `src/handbook/types.ts`
   - `src/handbook/components/HandbookTopBar.tsx`
   - `src/handbook/components/HandbookSecondaryMenu.tsx`
   - `src/handbook/components/HandbookBottomNav.tsx`
   - `src/handbook/HandbookShell.tsx`
4. Sua 2 loi TypeScript phat sinh trong `src/App.tsx` de du an build pass.

### Ket qua kiem tra

- `npm.cmd run lint`: pass
- `npm.cmd run build`: pass
- `npm.cmd run dev`: tren may hien tai van loi moi truong `spawn EPERM`, khong phai loi TypeScript/build.

## Viec tiep theo da chot

### Nhom 1 - Migration handbook

1. Tao script import handbook flat vao Supabase:
   - doc `handbook_nodes_flat.json`
   - insert/upsert vao `handbook_nodes`
   - co che do xoa sach section / import lai khi can
2. Tao tai lieu huong dan migration handbook trong docs.
3. Khi co file export tu he cu:
   - chay `handbook:flatten`
   - review `handbook_nodes_review.json`
   - chay script import vao Supabase

### Nhom 2 - Admin CRUD handbook moi

1. Tao service `src/handbook/services/handbookAdmin.ts`
2. Tao cac trang admin rieng cho handbook moi:
   - dashboard admin
   - CRUD node theo tung section
3. Chi noi admin nay trong module handbook moi, khong thay doi luong cua 2 he thong dang chay.

## Canh bao de lan sau khong nham

- Khong dung cac thay doi handbook moi de sua So tay cu.
- Khong dung handbook moi de sua He thong du lieu hien hanh.
- Neu phat hien can sua file dung chung co the anh huong runtime cua 2 he thong, phai dung lai va xin phe duyet truoc.

## Cap nhat tiep theo trong cung ngay 2026-03-30

### Viec moi vua bo sung

1. Tao script import handbook flat vao Supabase:
   - `scripts/import-handbook-flat.ts`
   - them lenh `npm run handbook:import`
2. Tao tai lieu huong dan migration/import:
   - `docs/handbook-import-guide.md`
3. Tao khung admin CRUD rieng cho handbook moi:
   - `src/handbook/services/handbookAdmin.ts`
   - `src/handbook/admin/AdminDashboardPage.tsx`
   - `src/handbook/admin/HandbookNodesAdminPage.tsx`
   - `src/handbook/admin/HandbookNoticesAdminPage.tsx`
4. Noi khung admin nay vao `src/handbook/HandbookShell.tsx` theo dang modal rieng, chi mo trong handbook moi.

### Cam ket an toan da giu dung

- Khong sua site So tay cu.
- Khong sua luong nghiep vu cua He thong du lieu dang chay.
- Admin handbook moi chi thao tac voi bang `handbook_*` tren Supabase.

### Buoc tiep theo de lam tiep

1. Tao bo du lieu mau cho `handbook_nodes` va `handbook_notices` de test handbook moi.
2. Neu user xac nhan, co the tiep tuc lam admin CRUD day du hon:
   - doi parent
   - doi thu tu
   - publish/unpublish
   - file/pdf refs editor
3. Sau do moi lam tiep search log, view log, favorites, recent views.

## Cap nhat tiep theo - bo du lieu mau handbook

### Viec moi vua bo sung

1. Tao file seed SQL de test handbook moi:
   - `supabase/handbook_seed_sample.sql`
2. Tao huong dan nap bo seed mau:
   - `docs/handbook-sample-seed-guide.md`

### Muc dich bo seed

- test nhanh homepage handbook moi
- test section pages
- test search handbook
- test admin handbook rieng
- van giu nguyen nguyen tac khong dong vao 2 he thong dang chay

## Luu y bo sung 2026-03-30

- Truoc khi chay `supabase/handbook_seed_sample.sql`, bat buoc phai chay `supabase/handbook_schema.sql` de tao cac bang `handbook_*`.
- Neu chua chay schema truoc, Supabase se bao loi `relation "handbook_nodes" does not exist`.
- Dot nay da sua triệt để lỗi font/mojibake cho Dashboard, Login và Cài đặt của Hệ thống dữ liệu hiện hành trong `src/App.tsx` theo yêu cầu của user.
- Viec sua nay da duoc user phe duyet truoc khi thuc hien vi co anh huong den he thong dang chay.

## Cap nhat bo sung 2026-03-30 - sua loi he thong du lieu hien hanh da duoc phe duyet

- User da phe duyet cho phep sua He thong du lieu hien hanh de xu ly 2 nhom loi:
  1. loi mojibake/font o Dashboard va Cai dat
  2. sai logic Dashboard o nhat ky theo doi don vi tiep nhan giua admin va contributor
- Da tach log ky thuat rieng tai `docs/system-data-maintenance-log.md` de tiep tuc theo doi cac thay doi da duoc phe duyet tren he thong du lieu hien hanh.
- Da bo sung script `npm run check:encoding` de canh bao som loi ma hoa tieng Viet truoc khi commit.

## Cap nhat tiep theo 2026-03-30 - nang cap admin CRUD handbook

### Viec moi vua bo sung

1. Nang cap trang admin node handbook:
   - chon `parent_id`
   - sua `sort_order`
   - sua `tag`
   - sua `file_url` / `file_name`
   - sua danh sach `pdf_refs`
   - bat/tat `is_published`
   - bat/tat `force_accordion`
2. Nang cap trang admin notices:
   - sua `published_at`
   - bat/tat `is_published`
3. Sua `HandbookShell` de sau khi admin save/delete node:
   - refresh lai home summaries
   - refresh lai admin data
   - refresh lai section nodes de preview handbook ben ngoai khop ngay
4. Tang cuong an toan ghi du lieu trong `handbookAdmin`:
   - loc `pdf_refs` khong hop le truoc khi upsert
   - tu sinh `slug` neu admin de trong
   - chan truong hop `parent_id = id`
   - chuan hoa `published_at`

### Huong tiep theo da hop ly nhat

1. Lam tiep `publish/unpublish` ro hon trong UI section neu can.
2. Bo sung thao tac doi parent/sort theo dang cay thay vi chi la form.
3. Sau nhom admin CRUD, moi den:
   - `search_logs`
   - `view_logs`
   - `favorites`
   - `recent_views`

## Cap nhat tiep theo 2026-03-30 - hanh vi nguoi dung cho handbook moi

### Viec moi vua bo sung

1. Tao service tuong tac handbook:
   - `src/handbook/services/handbookEngagement.ts`
   - ghi `search_logs`
   - ghi `view_logs`
   - quan ly `favorites`
   - quan ly `recent_views`
2. Noi `HandbookShell` voi thong tin user hien tai:
   - `src/App.tsx`
   - truyen `currentUser` vao handbook moi
3. Nang cap `HomePage`:
   - hien khu `Vua xem`
   - hien khu `Yeu thich`
4. Nang cap `SectionPage` va cac trang section:
   - them nut `Luu vao yeu thich`
   - khong doi cau truc doc noi dung hien co
5. Nang cap `SearchPage`:
   - hien loi tim kiem ngay trong panel

### Pham vi an toan da giu dung

- Chi sua `src/handbook/*` va mot diem noi props trong `src/App.tsx`.
- Khong dong vao site So tay cu.
- Khong dong vao luong nghiep vu cua He thong du lieu hien hanh.

### Buoc tiep theo de lam tiep

1. Them khu `feedback/gop y` cho handbook moi neu user xac nhan.
2. Hoac bo sung `thong bao`, `favorites`, `recent views` vao admin dashboard handbook de theo doi du lieu su dung.
3. Sau do moi chuyen sang pha migrate du lieu that tu site cu.

## Cap nhat tiep theo 2026-03-30 - feedback va migrate an toan

### Viec moi vua bo sung

1. Tao service `src/handbook/services/handbookFeedback.ts` de gui/lay du lieu tu bang `handbook_feedback`.
2. Nang cap `HandbookShell` de:
   - gui feedback handbook moi
   - load usage stats cho admin dashboard
   - refresh admin dashboard sau khi gui feedback neu admin dang mo panel
3. Nang cap `HomePage`:
   - them form `Gop y nhanh`
   - hien thong bao thanh cong/that bai
4. Nang cap `AdminDashboardPage`:
   - hien search logs
   - view logs
   - favorites
   - recent views
   - danh sach gop y gan day
5. Tao script `scripts/extract-handbook-tree.ts`
   - chap nhan file raw `treeData`
   - hoac Firestore document export JSON
6. Tao tai lieu:
   - `docs/handbook-legacy-export-guide.md`

### Y nghia cua dot nay

- Handbook moi da co vong phan hoi nguoi dung co ban.
- Admin handbook da co dashboard de nhin usage + gop y.
- Pipeline migrate da ro hon: `extract -> flatten -> review -> import`.
