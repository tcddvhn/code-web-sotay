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
