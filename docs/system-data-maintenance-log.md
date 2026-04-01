# System Data Maintenance Log

## Nguyen tac da duoc phe duyet

1. Day la nhom sua loi co tac dong den He thong du lieu hien hanh va da duoc user phe duyet truoc khi thuc hien.
2. Khong sua So tay hien hanh.
3. Moi thay doi tiep theo neu co nguy co anh huong 2 he thong dang chay phai bao user phe duyet truoc.

## Moc ngay 2026-03-30

### Sua loi Dashboard - nhat ky theo doi don vi tiep nhan

Van de user mo ta:
- Admin nhin thay so lieu tong quat dung.
- Admin loc theo User A thi thay User A duoc giao 02 don vi chua tiep nhan.
- User A dang nhap thuc te lai thay 0 don vi.

Nguyen nhan da xac dinh:
- `assignments` chi duoc tai khi `isAdmin = true`, nen contributor/User A khong bao gio nhan duoc danh sach don vi da duoc phan cong.
- Dashboard lai tinh `submittedCount` va `totalUnits` theo toan bo `allUnitLogs`, khong theo pham vi don vi duoc giao cho contributor.

Huong sua da thuc hien:
1. Tai `global_assignments` cho moi tai khoan da dang nhap, khong chi rieng admin.
2. Chi giu logic bootstrap tu du an legacy cho admin.
3. Tinh lai `dashboardScopeLogs`:
   - admin: xem toan bo danh sach nhu cu
   - contributor: chi tinh tren cac don vi duoc phan cong
4. Do do so lieu `Da tiep nhan / Chua tiep nhan` cua user se khop voi log ma admin xem theo user do.
5. Sua them chuoi fallback `Chua ro` trong `src/access.ts` de tranh loi hien thi ten nguoi duoc phan cong.

### Tang cuong phong chong loi ma hoa tieng Viet

Bo sung script kiem tra mojibake truoc khi commit:
- File: `scripts/check-encoding.ts`
- Lenh chay: `npm run check:encoding`

Muc tieu:
- Quet `src/`, `docs/`, `supabase/`
- Canh bao som cac chuoi co dau hieu mojibake pho bien

Khuyen nghi quy trinh truoc commit:
1. `npm run check:encoding`
2. `npm run lint`
3. `npm run build`

## Moc ngay 2026-03-31

### Cap nhat xuat bao cao theo workbook mau cua bieu

Yeu cau da duoc user phe duyet truoc khi sua:
- Bo nut "Xuat bieu dang chon" trong man Bao cao.
- Giu nut "Xuat toan bo bieu" la duong xuat duy nhat.
- Khi chon don vi "Dang bo Thanh pho", uu tien dung file mau da upload luc tao bieu mau de do so lieu tong hop 132 don vi vao dung workbook goc.

Huong sua da thuc hien:
1. Cap nhat `src/components/ReportView.tsx`:
   - Bo luong xuat rieng cho mot bieu.
   - Nut `Xuat toan bo bieu` duoc doi thanh nut chinh duy nhat.
   - Khi `selectedUnitCode = __TOTAL_CITY__`, he thong bat buoc moi bieu trong du an phai doc duoc workbook mau. Neu thieu file mau goc hoac khong doc duoc workbook, he thong dung xuat va thong bao ro ten cac bieu dang thieu.
   - Neu doc duoc workbook, he thong dung chinh workbook mau do lam nen va ghi so lieu tong hop vao cac o du lieu truoc khi tai ve.
2. Cap nhat `src/utils/templateWorkbook.ts` + `src/supabase.ts`:
   - Neu template co `sourceWorkbookUrl` thi dung truc tiep.
   - Neu chi con `sourceWorkbookPath` thi tu sinh public URL tu Supabase Storage de van tai dung file mau goc.

Luu y nghiep vu:
- Co che nay chi tac dong den luong xuat trong man Bao cao cua he thong du lieu hien hanh.
- Khong can thiiep vao So tay hien hanh.

### Hoan tat va xac nhan ky thuat cho thay doi xuat bao cao

Ket qua thuc hien:
1. Viet lai `src/components/ReportView.tsx` thanh ban sach UTF-8 de loai bo vung mojibake/phat sinh loi parse.
2. Giu duy nhat nut `Xuat toan bo bieu`.
3. Loai bo luong `Xuat bieu dang chon` khoi module Bao cao.
4. Khi chon `Dang bo Thanh pho`, he thong:
   - bat buoc uu tien workbook mau da upload luc tao bieu
   - ghi du lieu tong hop cua toan bo don vi vao dung cac o du lieu trong workbook mau
   - canh bao va dung xuat neu thieu workbook mau o bat ky bieu nao
5. Van luu lich su xuat bao cao len Supabase sau khi tai file thanh cong.

Xac nhan ky thuat da chay:
- `npm run check:encoding`: pass
- `npm run lint`: pass
- `npm run build`: pass
- Smoke test local `npm run dev` + HTTP 200: pass

### Dieu chinh giao dien Bao cao theo yeu cau 2026-03-31

Yeu cau duoc user phe duyet:
- Bo khung `Thong tin xuat du lieu` trong man Bao cao vi khong can thiet.

Thuc hien:
- Cap nhat `src/components/ReportView.tsx` de bo cot thong tin ben phai.
- Giu lai duy nhat khu bang bao cao va nut `Xuat toan bo bieu`.

### Khoi phuc cach hien thi bieu trong man Bao cao theo file doi chieu user cung cap

Yeu cau duoc user phe duyet:
- Giu nguyen cach the hien bieu trong man Bao cao nhu truoc khi sua logic xuat.
- Chi cho phep thay doi luong export, khong lam thay doi bo cuc bang bao cao dang dung.

Thuc hien:
- Doi chieu file `D:\ReportView.tsx` user cung cap.
- Khoi phuc lai bo cuc chon du an / nam / don vi / tim kiem, cum tab bieu, table shell, sticky cot dau, modal chi tiet o du lieu.
- Van giu logic export moi:
  - bo `Xuat bieu dang chon`
  - giu `Xuat toan bo bieu`
  - ho tro workbook mau bat buoc cho lua chon `Dang bo Thanh pho`.

Xac nhan ky thuat:
- `npm run lint`: pass
- `npm run build`: pass

### Chuan hoa tai lieu ban giao ngay 2026-04-01

Thuc hien:
- Viet lai file `docs/data-system-handoff-2026-04-01.md` ve UTF-8 sach.
- Rut gon noi dung theo trang thai con hieu luc hien nay de dung tiep o may khac.
- Giu ro cac nguyen tac, cac thay doi da lam, va quy trinh test/kiem tra truoc commit.

### Bo sung keo thay doi do rong cot trong man Bao cao ngay 2026-04-02

Yeu cau da duoc user phe duyet truoc khi sua:
- Cho phep keo thay doi do rong cot ngay tren bang bao cao.
- Giu nguyen man Bao cao dang chay, chi bo sung tay nam keo va khong thay doi logic nghiep vu khac.

Thuc hien:
- Cap nhat src/components/ReportView.tsx.
- Bo sung state do rong cot theo tung bieu, luu vao localStorage theo key du an + bieu + kieu render.
- Nhanh bang thuong: them tay nam keo o mep phai cac cot la trong header va doi 	able-layout sang ixed de do rong cot duoc dieu khien bang colgroup.
- Nhanh workbook-based: bo sung mot hang dieu khien do rong cot rieng o dau bang, dong bo colgroup cho tat ca section de cac cot merge van thay doi dung theo layout workbook.
- Su dung pointerdown / pointermove / pointerup thay vi chi mousedown / mousemove / mouseup de tuong thich tot hon voi chuot va touch.

Ghi chu:
- Thay doi nay chi tac dong den module Bao cao cua he thong du lieu hien hanh va da duoc user phe duyet truoc.
