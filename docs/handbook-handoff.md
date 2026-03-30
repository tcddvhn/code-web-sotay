# HANDBOOK HANDOFF

## Muc dich file nay

Day la file ban giao de tiep tuc xay moi module `So tay` tren nen `code-web-sotay` o may khac ma khong can doc lai toan bo lich su chat.

## Nguyen tac da chot

1. Khong gop 2 app cu theo kieu va code truc tiep.
2. Lay `code-web-sotay` lam nen ky thuat chinh.
3. Xay moi phan `tcddvhn.id.vn` ben trong nen moi.
4. Trong qua trinh xay moi, khong dong vao repo/site `sotay-dangvien`.
5. Repo/site cu chi duoc dung de:
   - doc nghiep vu
   - doi chieu giao dien
   - xuat du lieu phuc vu migrate

## Repo lien quan

### Repo moi dang phat trien

- `/Users/tranhau/Documents/GitHub/code-web-sotay`

### Repo cu chi de tham chieu

- `/Users/tranhau/Documents/GitHub/sotay-dangvien`

## Muc tieu san pham cuoi

Xay mot app moi tren nen `code-web-sotay`, sau nay gan domain:

- `https://tcddvhn.id.vn`

## Giao dien da chot

### 6 muc dieu huong chinh

1. `Trang chu`
2. `Quy dinh`
3. `Hoi dap`
4. `Bieu mau`
5. `Tai lieu`
6. `He thong du lieu`

### Quy tac mobile

- Mobile giu 5 tab So tay nhu site cu:
  - `Trang chu`
  - `Quy dinh`
  - `Hoi dap`
  - `Bieu mau`
  - `Tai lieu`
- `He thong du lieu` vao bang `menu phu`

### Quy tac admin

Admin phai co khu quan tri chung cho:

- `Quy dinh`
- `Hoi dap`
- `Bieu mau`
- `Tai lieu`
- `He thong du lieu`

Route admin de xuat:

- `/admin`
- `/admin/quy-dinh`
- `/admin/hoi-dap`
- `/admin/bieu-mau`
- `/admin/tai-lieu`
- `/admin/he-thong-du-lieu`

## Tai lieu thiet ke da tao

1. Ke hoach tong the:
- [docs/handbook-rebuild-plan.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-rebuild-plan.md)

2. Ke hoach migrate:
- [docs/handbook-migration-plan.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-migration-plan.md)
3. Huong dan xuat du lieu cu:
- [docs/handbook-legacy-export-guide.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-legacy-export-guide.md)

## Nhung gi da tao trong repo moi

### 1. Shell giao dien So tay moi

- [src/handbook/HandbookShell.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/HandbookShell.tsx)
- [src/handbook/config.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/config.ts)
- [src/handbook/types.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/types.ts)

Components:

- [src/handbook/components/HandbookTopBar.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/components/HandbookTopBar.tsx)
- [src/handbook/components/HandbookBottomNav.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/components/HandbookBottomNav.tsx)
- [src/handbook/components/HandbookSecondaryMenu.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/components/HandbookSecondaryMenu.tsx)

Tinh trang:

- Moi la shell preview
- Chua lay du lieu that tu Supabase
- Chua thay site cu
- Chua thay trang mac dinh cua app hien tai

### 2. Da noi shell preview vao app hien tai

Da them mot loi vao rieng:

- `So tay (moi)`

File da sua:

- [src/App.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx)
- [src/components/Sidebar.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/Sidebar.tsx)
- [src/types.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/types.ts)

Tinh trang:

- App hien tai van mac dinh vao `Dashboard`
- Luong du lieu hien co khong bi thay doi
- Shell So tay moi chi la preview an toan trong repo moi

### 3. Da tao schema Supabase cho So tay

- [supabase/handbook_schema.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/handbook_schema.sql)

No gom cac bang:

- `handbook_nodes`
- `handbook_notices`
- `handbook_feedback`
- `handbook_search_logs`
- `handbook_view_logs`
- `handbook_favorites`
- `handbook_recent_views`
- `handbook_push_tokens`
- `handbook_settings`

Tinh trang:

- Moi tao file SQL trong repo
- Chua chac da duoc chay tren Supabase
- Khong duoc tu y chay neu chua co xac nhan tu user

### 4. Da tao script flatten du lieu export tu he cu

- [scripts/flatten-handbook-export.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/scripts/flatten-handbook-export.ts)

Script nay:

- doc file JSON export tu `treeData`
- flatten cay thanh danh sach node
- map `tag` -> `section`
- tao:
  - `handbook_nodes_flat.json`
  - `handbook_nodes_review.json`
  - `migration_summary.json`

Da them script vao:

- [package.json](/Users/tranhau/Documents/GitHub/code-web-sotay/package.json)

Lenh du kien:

```bash
npm run handbook:flatten -- /duong-dan/treeData.json
```

Hoac:

```bash
npm run handbook:flatten -- /duong-dan/treeData.json tmp/handbook-export
```

Luu y:

- May hien tai khong co `node/npm` trong PATH nen chua chay thu duoc

### 5. Da bo sung hanh vi nguoi dung cho handbook moi

Da noi cac tinh nang:

- `search_logs`
- `view_logs`
- `favorites`
- `recent_views`

File lien quan:

- [src/handbook/services/handbookEngagement.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/services/handbookEngagement.ts)
- [src/handbook/HandbookShell.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/HandbookShell.tsx)
- [src/handbook/pages/HomePage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/HomePage.tsx)
- [src/handbook/pages/SectionPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/SectionPage.tsx)
- [src/handbook/pages/SearchPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/SearchPage.tsx)
- [src/App.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx)

Tinh trang:

- Da co `Vua xem` va `Yeu thich` tren Trang chu handbook moi
- Da co nut luu yeu thich trong trang doc section
- Da ghi log tim kiem va xem noi dung vao cac bang `handbook_*`
- Van chua dong vao site So tay cu

### 6. Da bo sung feedback va pipeline extract an toan

File lien quan:

- [src/handbook/services/handbookFeedback.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/services/handbookFeedback.ts)
- [src/handbook/admin/AdminDashboardPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/admin/AdminDashboardPage.tsx)
- [src/handbook/pages/HomePage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/HomePage.tsx)
- [src/handbook/HandbookShell.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/HandbookShell.tsx)
- [scripts/extract-handbook-tree.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/scripts/extract-handbook-tree.ts)
- [docs/handbook-legacy-export-guide.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-legacy-export-guide.md)

Tinh trang:

- Da co form `Gop y nhanh` tren Trang chu handbook moi
- Admin dashboard da co usage counters va gop y gan day
- Da co lenh:

```bash
npm run handbook:extract -- <input.json> tmp/handbook-export/treeData.json
```

- Lenh nay khong dong vao site cu, chi xu ly file export dau vao

### 7. Da nang cap UX tang toc cho handbook moi

File lien quan:

- [src/handbook/config.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/config.ts)
- [src/handbook/pages/HomePage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/HomePage.tsx)
- [src/handbook/pages/SearchPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/SearchPage.tsx)
- [src/handbook/pages/SectionPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/SectionPage.tsx)
- [src/handbook/pages/RegulationsPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/RegulationsPage.tsx)
- [src/handbook/pages/FaqPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/FaqPage.tsx)
- [src/handbook/pages/FormsPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/FormsPage.tsx)
- [src/handbook/pages/DocumentsPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/DocumentsPage.tsx)

Tinh trang:

- Search da duoc day len thanh diem vao noi bat tren Trang chu
- Danh sach noi dung trong tung section da co bo loc nhanh va chip tag de scan nhanh hon
- Cac nhan ky thuat da duoc doi sang ngon ngu than thien voi nguoi dung

### 8. Da pivot giao dien handbook de giong site So tay cu hon

File lien quan:

- [src/handbook/HandbookShell.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/HandbookShell.tsx)
- [src/handbook/components/HandbookTopBar.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/components/HandbookTopBar.tsx)
- [src/handbook/components/HandbookBottomNav.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/components/HandbookBottomNav.tsx)
- [src/handbook/components/HandbookSecondaryMenu.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/components/HandbookSecondaryMenu.tsx)
- [src/handbook/pages/HomePage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/HomePage.tsx)
- [src/handbook/pages/SearchPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/SearchPage.tsx)
- [src/handbook/pages/SectionPage.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/pages/SectionPage.tsx)

Tinh trang:

- Khong con di theo huong card-heavy nua
- Header handbook moi da doi ve kieu top bar do co dinh
- Mobile giu 5 tab duoi man hinh nhu site cu
- `He thong du lieu` van vao bang menu phu
- `SectionPage` da doi ve dang danh sach mo rong tung muc, hop hon voi noi dung nghiep vu nhieu chu
- Day la lop giao dien moi tren nen du lieu Supabase, khong phai copy code cu

## Nhung gi tuyet doi KHONG duoc lam luc nay

1. Khong sua repo `sotay-dangvien`
2. Khong deploy lai site cu
3. Khong cat domain `tcddvhn.id.vn` sang app moi luc nay
4. Khong doi trang mac dinh cua `code-web-sotay` thanh So tay khi chua xong migrate
5. Khong dong vao he thong du lieu hien dang chay on, tru khi co yeu cau rieng

## Canh bao ky thuat quan trong

1. May hien tai KHONG co `node/npm`, nen chua build/lint duoc.
2. Moi thay doi gan day cho So tay moi chi la:
   - tao file moi
   - noi vao menu preview
   - khong can thiệp vao logic nghiep vu hien tai

## Viec tiep theo neu user noi "thuc hien tiep 5 buoc tu xuat JSON"

Can hieu day la chuoi sau:

1. Xuat JSON tu site cu phuc vu migrate
2. Chay `handbook:extract`
3. Chay `handbook:flatten`
4. Review output va doi chieu mapping
5. Import vao Supabase va so sanh handbook moi voi site cu
3. `sotay-dangvien` hien la SPA DOM thuan, co:
   - Firestore content tree
   - Firebase Auth admin
   - Google Apps Script cho notice/chat/survey/stats
4. Dinh huong da chot la:
   - viet lai theo React + Supabase
   - khong tai su dung `app.js` cu nhu loi chinh

## Bieu dien logic migrate da chot

Map `tag` cu sang section moi:

- tag chua `hoi dap` -> `hoi-dap`
- tag chua `bieu mau` -> `bieu-mau`
- tag chua `tai lieu` -> `tai-lieu`
- con lai -> `quy-dinh`

Neu node mo ho:

- dua vao `handbook_nodes_review.json`
- review tay sau

## Buoc tiep theo phai lam ngay o may khac

### Buoc 1 - Doc lai bo tai lieu

Doc 3 file sau truoc khi code:

- [docs/handbook-rebuild-plan.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-rebuild-plan.md)
- [docs/handbook-migration-plan.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-migration-plan.md)
- [docs/handbook-handoff.md](/Users/tranhau/Documents/GitHub/code-web-sotay/docs/handbook-handoff.md)

### Buoc 2 - Kiem tra code da co

Rà cac file:

- [src/handbook/HandbookShell.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/HandbookShell.tsx)
- [supabase/handbook_schema.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/handbook_schema.sql)
- [scripts/flatten-handbook-export.ts](/Users/tranhau/Documents/GitHub/code-web-sotay/scripts/flatten-handbook-export.ts)

### Buoc 3 - Viec can lam tiep theo theo thu tu uu tien

1. Tao schema SQL chot lan cuoi cho `handbook_*`
   - ra soat cot
   - ra soat RLS
   - chot cac bang can thiet cho pha 1 va 2

2. Chuan bi xuat du lieu tu he cu
   - lay `treeData` Firestore thanh JSON
   - khong sua site cu

3. Chay script flatten
   - tao file flat
   - tao file review
   - doi chieu tong node va section

4. Tao service doc du lieu handbook tu Supabase trong repo moi
   - vi du:
     - `src/handbook/services/handbookContent.ts`
     - `src/handbook/services/handbookSearch.ts`

5. Noi `HandbookShell` vao du lieu that
   - bat dau tu `Trang chu`
   - sau do `Quy dinh`
   - roi `Hoi dap`
   - roi `Bieu mau`
   - roi `Tai lieu`
6. Sau khi doc noi dung on moi lam admin editor
7. Sau nhom admin CRUD, bo sung:
   - `search_logs`
   - `view_logs`
   - `favorites`
   - `recent_views`

## Tinh trang hien tai sau cap nhat moi nhat

- Buoc 5, 6 va 7 o tren da duoc thuc hien mot phan lon.
- Shell handbook moi hien da:
  - doc du lieu section
  - tim kiem
  - quan tri co ban
  - ghi log tim kiem/xem
  - luu yeu thich
  - luu vua xem

## Buoc tiep theo hop ly nhat luc nay

1. Xuat `treeData` tu he cu thanh file JSON.
2. Chay `handbook:extract`.
3. Chay `handbook:flatten`.
4. Review file output.
5. Chay import vao Supabase.
6. Doi chieu giao dien handbook moi voi site cu.

## Cap nhat moi nhat 2026-03-30 cuoi ngay

Da bo sung them cho admin handbook:

- sua `parent_id`
- sua `sort_order`
- sua `tag`
- sua `file_url` / `file_name`
- sua `pdf_refs`
- bat/tat `is_published`
- bat/tat `force_accordion`
- notices co them `published_at` va `is_published`

Da sua luon luong refresh:

- sau khi save/delete node handbook, phan preview section va homepage handbook ben ngoai duoc refresh lai ngay

Da tang cuong service ghi:

- loc `pdf_refs` rong/khong hop le
- tu sinh `slug` neu bo trong
- chan `parent_id = id`

## Viec chinh sua cu the du kien o pha tiep theo

### Nhung file kha nang cao se duoc tao tiep

- `src/handbook/services/handbookContent.ts`
- `src/handbook/services/handbookSearch.ts`
- `src/handbook/pages/HomePage.tsx`
- `src/handbook/pages/RegulationsPage.tsx`
- `src/handbook/pages/FaqPage.tsx`
- `src/handbook/pages/FormsPage.tsx`
- `src/handbook/pages/DocumentsPage.tsx`

### Nhung file kha nang cao se duoc sua tiep

- [src/App.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx)
- [src/handbook/HandbookShell.tsx](/Users/tranhau/Documents/GitHub/code-web-sotay/src/handbook/HandbookShell.tsx)
- [supabase/handbook_schema.sql](/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/handbook_schema.sql)

## Cach bat dau lai o may khac

1. Dang nhap GitHub
2. Pull repo moi nhat
3. Mo repo `code-web-sotay`
4. Noi voi agent moi:

```text
Doc docs/handbook-rebuild-plan.md, docs/handbook-migration-plan.md, docs/handbook-handoff.md, ra soat src/handbook va supabase/handbook_schema.sql, sau do tiep tuc trien khai module So tay moi tren nen code-web-sotay theo ke hoach da chot. Khong dong vao sotay-dangvien.
```

## Tinh trang git luc ban giao

Can du kien co cac file moi/sua quanh:

- `docs/`
- `src/handbook/`
- `scripts/flatten-handbook-export.ts`
- `supabase/handbook_schema.sql`
- mot so sua nho trong:
  - `src/App.tsx`
  - `src/components/Sidebar.tsx`
  - `src/types.ts`
  - `package.json`

## Chot lai

Neu mo lai o may khac, uu tien cao nhat la:

1. Khong dong vao site cu
2. Khong lam rung he thong du lieu hien tai
3. Bat dau tu du lieu migrate va shell handbook moi
