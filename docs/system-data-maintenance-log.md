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

### Nghien cuu phuong an bo sung chi so khoa nhan dien sheet trong Tiep nhan du lieu ngay 2026-04-02

Yeu cau user:
- Ngoai dieu kien khop ten sheet tuyet doi, bo sung bo chi so khoa de xac dinh sheet co dung bieu mau da chot hay khong.
- Chi so khoa duoc xac dinh tu hang tieu de chinh dau, hang tieu de chinh cuoi, va so dong nam giua.
- Neu khong khop, file phai bi danh dau khong hop le va dua vao tong hop loi cuoi dot, gop chung voi cac loi thieu / sai sheet hien co.

Ket qua nghien cuu:
- src/components/FormLearner.tsx hien da co cac thong so phu hop de dat nen cho bo chi so khoa: sheetName, headerLayout, columnMapping.startRow/endRow, locks, va file mau goc (sourceWorkbookPath/sourceWorkbookUrl).
- src/components/ImportFiles.tsx hien dang validate theo ten sheet qua alidateWorkbookSheetNames(...), sau do moi parse sheet da khop. Co the mo rong ngay tai lop validate nay ma khong can thay doi co che tong hop thong bao cuoi dot.
- Phuong an de xuat: luu them tren tung template mot sheetSignature rieng o cap sheet (khong tron vao logic render bao cao), gom headerStartRow, headerEndRow, headerStartCol, headerEndCol, startRowText, endRowText, middleRowCount. Co the tu sinh tu file mau goc va cho phep user dieu chinh/xac nhan trong FormLearner.
- Khi tiep nhan file: voi moi sheet bat buoc, he thong se kiem tra theo thu tu: (1) khop ten sheet tuyet doi; (2) doc hang dau/cuoi trong vung signature va chuan hoa text de so sanh; (3) kiem tra so dong o giua; neu lech bat ky dieu kien nao thi sheet do duoc danh dau sai mau.
- File chi duoc tiep nhan khi tat ca bieu bat buoc cua du an deu dat ca ten sheet va chi so khoa. Neu khong, file bi bo qua va dua vao danh sach loi cuoi dot cung voi ly do cu the theo tung sheet.
- Khong tao loai thong bao moi; chi bo sung them ly do dang Sai chi so khoa sheet ... vao alidation.reason, ailedFiles, va tong ket cuoi dot trong ImportFiles.
- De tranh anh huong he thong dang chay, nen trien khai theo 2 buoc: (1) bo sung truong signature va UI xac nhan trong FormLearner; (2) mo rong validate workbook trong ImportFiles. Khong can sua logic bao cao hay dashboard.

### Trien khai chi so khoa nhan dien sheet trong Tiep nhan du lieu ngay 2026-04-02

Yeu cau da duoc user phe duyet:
- Bo sung thong so chi so khoa tren bieu mau de doi chieu hang tieu de dau, hang tieu de cuoi va so dong o giua.
- Cac bieu mau da tao roi van phai hien va cho phep cau hinh ngay cac thong so nay.
- Khi tiep nhan file, neu sheet sai chi so khoa thi khong duoc ghi du lieu va phai gop vao thong bao tong ket loi hien co.

Thuc hien:
- Cap nhat src/types.ts de bo sung SheetSignatureConfig va luu trong columnMapping.sheetSignature cua template.
- Cap nhat src/utils/workbookUtils.ts de tu dong sinh / hoan thien chi so khoa tu workbook mau va kiem tra lai workbook duoc nop bang alidateTemplateSheetSignature(...).
- Cap nhat src/components/FormLearner.tsx de hien thong so chi so khoa cho ca bieu mau tao moi va bieu mau da ton tai; khi luu chinh sua se tu dong doc lai workbook mau de tinh startRowText, endRowText va middleRowCount.
- Cap nhat src/components/ImportFiles.tsx de bo sung lop validate moi: ngoai ten sheet, moi sheet bat buoc con phai dat chi so khoa. Neu sai, file bi danh dau invalid voi ly do gop chung vao alidation.reason, ailedFiles va tong ket cuoi dot.

Xac nhan ky thuat:
- Se chay 
pm run check:encoding, 
pm run lint, 
pm run build sau khi hoan tat cap nhat logic import.


### Tao tai lieu tong hop trung tam cho he thong du lieu ngay 2026-04-02

Yeu cau user:
- Tao mot van ban trong docs de liet ke, giai trinh toan bo module, luong xu ly va lam noi ghi nho tong hop de tranh sai sot ve sau.

Thuc hien:
- Tao file docs/system-data-master-ledger.md lam tai lieu tong hop trung tam.
- Noi dung gom: nguyen tac van hanh, kien truc hien tai, danh sach module, luong xu ly chinh, mo hinh du lieu Supabase, diem nong ky thuat, quy tac ghi lich su, va lich su thay doi muc cao.
- Quy uoc tu nay moi thay doi lien quan he thong du lieu phai cap nhat toi thieu vao docs/system-data-maintenance-log.md, va neu thay doi anh huong module / luong xu ly / rui ro thi cap nhat them vao docs/system-data-master-ledger.md.


### Chuan hoa lai file handoff trong docs ngay 2026-04-02

Yeu cau user:
- Chuan hoa tiep file docs/data-system-handoff-2026-04-01.md de thong nhat voi bo docs hien tai.

Thuc hien:
- Viet lai toan bo file docs/data-system-handoff-2026-04-01.md ve UTF-8 sach.
- Giu noi dung handoff can thiet: nguyen tac, trang thai tong quat, thay doi theo module, cac loi da tung xu ly, quy trinh test va cau nhac ngan cho may khac.
- Khong thay doi logic he thong; chi chuan hoa tai lieu.

## Moc ngay 2026-04-04

### Dung giao dien preview cho module Phan tich AI

Yeu cau user phe duyet:
- Tao truoc giao dien cho module `Phan tich AI`
- chot trai nghiem nguoi dung truoc khi trien khai schema va AI backend
- khong duoc anh huong cac module dang chay on dinh

Thuc hien:
- Them `AI_ANALYSIS` vao view mode.
- Tao `src/components/AIAnalysisView.tsx`.
- Noi menu desktop vao `Sidebar`.
- Bo sung loi vao mobile tu `Dashboard`.
- Ho tro chon nhieu du an.
- Neu chon `Theo bieu`, danh sach bieu hien toan bo bieu cua cac du an da chon, kem ten du an de tranh nham.

Luu y:
- Day moi la UI preview.
- Chua goi AI that.
- Chua sua luong `Dashboard`, `Bao cao`, `Tiep nhan du lieu`.

### Tao nen du lieu ky thuat cho Phan tich AI ma chua noi vao runtime

Yeu cau user phe duyet:
- Tiep tuc theo pha ky thuat sau khi chot giao dien.
- Van phai giu nguyen he thong du lieu dang chay.

Thuc hien:
- Tao file SQL rieng `supabase/ai_analysis_setup.sql`.
- Tao service rieng `src/aiAnalysisStore.ts`.
- De xuat hai bang moi:
  - `analysis_cells`
  - `ai_analysis_reports`
- Them cac ham:
  - build / upsert / list / delete `analysis_cells`
  - create / list `ai_analysis_reports`

Nguyen tac:
- Chua noi vao luong import hien tai.
- Chua dong bo tu `consolidated_rows` trong runtime.
- Chi bo sung lop nen de trien khai tiep o pha sau.

### Noi dong bo `analysis_cells` vao runtime va kich hoat summary that cho Phan tich AI ngay 2026-04-04

Yeu cau user phe duyet:
- Sau khi da chay buoc 1 tren Supabase, tiep tuc buoc 2 va 3:
  - dong bo `consolidated_rows -> analysis_cells`
  - bo sung summary RPC cho module `Phan tich AI`
- Van phai giu nguyen nguyen tac khong anh huong cac module dang chay on dinh.

Thuc hien:
- Cap nhat `src/App.tsx`:
  - sau khi import thanh cong va refresh rows/data_files, goi `syncAnalysisCellsFromRows(...)`
  - khi xoa theo don vi / nam / bieu / du an, goi xoa tuong ung trong `analysis_cells`
  - toan bo cac buoc nay deu boc `try/catch` va chi `console.warn` neu lop phan tich loi
- Cap nhat `src/components/AIAnalysisView.tsx`:
  - doc `get_ai_analysis_scope_summary`
  - doc `get_ai_analysis_project_summary`
  - doc `get_ai_analysis_template_summary`
  - doc lich su tu `ai_analysis_reports`
  - neu RPC chua san sang hoac bi loi thi fallback ve so lieu uoc tinh, khong lam sap UI
- Tao file `supabase/ai_analysis_rpc.sql`:
  - `get_ai_analysis_scope_summary`
  - `get_ai_analysis_project_summary`
  - `get_ai_analysis_template_summary`

Luu y van hanh:
- De summary that chay du, can chay them `supabase/ai_analysis_rpc.sql`
- `analysis_cells` hien la lop phan tich phan chieu du lieu van hanh, khong phai nguon du lieu goc
- Neu lop phan tich loi, luong `Tiep nhan du lieu` va `Xoa du lieu` van phai tiep tuc hoat dong

### Kich hoat pha AI that cho module Phan tich AI ngay 2026-04-04

Yeu cau user phe duyet:
- Tiep tuc sau khi da co `analysis_cells` va summary RPC
- Uu tien preview that va lich su that truoc
- Khong duoc anh huong `Dashboard`, `Bao cao`, `Tiep nhan du lieu`, `Bieu mau`

Thuc hien:
- Tao `src/aiAnalysisEngine.ts`
  - build payload phan tich tu:
    - summary pham vi
    - summary theo du an
    - summary theo bieu
    - phat hien bat thuong client-side tu `analysis_cells`
    - so sanh voi nam truoc neu chon phan tich theo nam
  - goi Gemini qua `@google/genai`
  - ep model tra JSON co cau truc
- Cap nhat `src/components/AIAnalysisView.tsx`
  - bo sung o nhap Gemini API key (fallback ve `VITE_GEMINI_API_KEY`)
  - nut `Tao phan tich AI` da goi AI that
  - luu lich su vao `ai_analysis_reports`
  - hien preview that tu ket qua JSON cua AI
  - `Xuat DOCX` tam thoi de trang thai `sap co`
- Cap nhat `src/App.tsx`
  - truyen `allUnits` vao `AIAnalysisView` de phan tich nhieu du an khong bi thieu nguon don vi
  - truyen thong tin user hien tai de luu lich su bao cao AI

Luu y:
- Pha nay chua sinh DOCX that
- Pha nay chua dua them RPC moi cho `year comparison` va `anomalies`; hien dang ket hop summary RPC san co voi tinh toan client-side de tranh anh huong runtime

### Noi blueprint bao cao va tieu chi that vao module Phan tich AI ngay 2026-04-04

Yeu cau user:
- Cho phep upload bao cao mau de AI doc va sinh khung bao cao.
- Bao cao AI phai phan tich theo ten tieu chi that, khong chi dua vao tong o du lieu / so dong.
- Lam den muc van hanh duoc tren du lieu that, nhung khong duoc anh huong cac module dang chay on dinh.

Thuc hien:
- Tao SQL moi `supabase/ai_report_blueprints.sql` cho bang `ai_report_blueprints`.
- Mo rong `src/aiAnalysisStore.ts`:
  - them `AIReportBlueprintRecord`
  - them `AIReportBlueprintContent`
  - them `AIIndicatorSummary`
  - them `buildIndicatorSummariesFromRows(...)`
  - them `listAIReportBlueprints(...)`
  - them `createAIReportBlueprint(...)`
  - neu bang Supabase chua ton tai thi fallback sang `localStorage` de van test duoc UI
- Mo rong `src/aiAnalysisEngine.ts`:
  - them `extractReportBlueprintFromSample(...)`
  - them `indicatorSummariesOverride`
  - them `reportBlueprint`
  - AI output co them `blueprintSections`
  - prompt moi bat AI phan tich theo `row_label + column_label`
- Cap nhat `src/components/AIAnalysisView.tsx`:
  - them khu `Mau bao cao`
  - cho chon / doc / luu blueprint
  - khi tao phan tich, build indicator summaries that tu du lieu dang chon
  - doi voi tang `Dang bo Thanh pho`, uu tien row tong hop cap thanh pho neu ton tai
  - preview va trinh soan thao da hien duoc cac muc viet theo blueprint
- Cap nhat `src/utils/docxExport.ts` de xuat duoc `blueprintSections`.

Luu y:
- Muon persist blueprint that tren Supabase thi can chay them `supabase/ai_report_blueprints.sql`.
- Neu chua chay SQL moi, blueprint van co the test duoc qua `localStorage`, nhung chi luu tren trinh duyet hien tai.

## Moc ngay 2026-04-06

### Chuan bi script tao 132 tai khoan vao Supabase Auth

Yeu cau user:
- Tao them 132 tai khoan vao Supabase Authentication > Users theo file Excel Danh_sach_taikhoan.xlsx.
- Mat khau mac dinh: tctuhn@456.
- Can huong dan cach lay service_role key.

Thuc hien:
- Doc file C:\Users\ldkie\OneDrive\KIEN_BTCTU\Nam 2026\TONGHOPSOLIEU\Danh_sach_taikhoan.xlsx va xac nhan duoc 132 dong du lieu hop le.
- Tao script scripts/import-supabase-auth-users.mjs de doc file Excel va goi supabase.auth.admin.createUser(...).
- Script gan user_metadata gom: display_name, unit_code, unit_name, import_source.
- Script co ho tro --dry-run, --file, --sheet va doc SUPABASE_SERVICE_ROLE_KEY tu bien moi truong.
- Them npm script uth:import-users vao package.json.
- Tao tai lieu van hanh docs/supabase-auth-bulk-import-guide.md va bo sung muc lien quan vao docs/system-data-master-ledger.md.

Luu y van hanh:
- Script nay chi tao user trong Supabase Auth, chua tao role/profile nghiep vu rieng neu he thong can them bang phu tro.
- service_role key khong duoc dua vao frontend, khong commit len GitHub, chi duoc dung local/server-side.


### Ra soat vi tri dung Supabase key truoc khi tat legacy JWT-based API keys ngay 2026-04-06

Yeu cau user:
- Kiem tra toan bo he thong xem co cho nao dang dung key cu hay khong.
- Neu tat Disable JWT-based API keys thi can thay cac key o dau.

Ket qua ra soat trong repo:
- Runtime frontend dang dung VITE_SUPABASE_PUBLISHABLE_KEY trong src/supabase.ts; neu env khong co thi file nay dang fallback sang mot sb_publishable_... hardcode.
- Khong co cho runtime nao trong app doc SUPABASE_SERVICE_ROLE_KEY.
- Cho duy nhat doc key server-side la script scripts/import-supabase-auth-users.mjs.
- .env hien tai khong luu Supabase key; chi co Gemini key.

Tai lieu da cap nhat:
- Bo sung section Checklist sau khi bam Disable JWT-based API keys vao docs/supabase-auth-bulk-import-guide.md.

Luu y:
- Cac noi ngoai repo nhu Vercel env, may khac, terminal history, Edge Functions, cron job khong the tu dong kiem tra tu day; user phai tu ra soat truoc khi tat legacy keys.

- 2026-04-06: Sá»­a lá»—i TypeScript táº¡i `src/components/AIAnalysisView.tsx` (`sumRowValues` vÃ  cÃ¡c phÃ©p cá»™ng dá»“n `total_value`) do `row.values` bá»‹ suy luáº­n lÃ  `unknown[]`. Chuáº©n hÃ³a kiá»ƒu dá»¯ liá»‡u Ä‘áº§u vÃ o cá»§a hÃ m cá»™ng dá»“n Ä‘á»ƒ `npm run lint` khÃ´ng cÃ²n fail vÃ¬ ba dÃ²ng 153 / 390 / 435.

## Moc ngay 2026-04-06 - rollout 132 tai khoan don vi

Yeu cau user:
- 132 tai khoan don vi tu dang nhap va nop file cho chinh don vi cua minh.
- Menu cua tai khoan don vi chi con: Dashboard, Tiep nhan du lieu, Bao cao.
- Tiep nhan du lieu voi tai khoan don vi chi cho 1 file, khong cho chon thu muc, va tu dong gan don vi theo tai khoan dang nhap.
- Neu don vi da co du lieu thi khong duoc ghi de truc tiep; phai tao yeu cau ghi de va cho admin phe duyet ngay tai man Tiep nhan du lieu.

Da thuc hien:
- Mo rong role `unit_user` trong `src/types.ts`, `src/supabase.ts`, `src/access.ts`.
- Cap nhat `src/App.tsx`:
  - bootstrap `user_profiles` cho `unit_user` neu login lan dau ma profile chua co
  - khoa route quan tri voi `unit_user`
  - gioi han du lieu Dashboard theo `unit_code`
  - gioi han danh sach du an hien cho `unit_user` ve cac du an ACTIVE
- Cap nhat `src/components/Sidebar.tsx` de `unit_user` chi thay 3 menu duoc phep.
- Cap nhat `src/components/ReportView.tsx` de khoa bo loc don vi theo don vi dang nhap cua `unit_user`.
- Cap nhat `src/components/ImportFiles.tsx`:
  - `unit_user` chi chon 1 file
  - an nut chon thu muc
  - tu dong gan don vi theo tai khoan
  - neu da co du lieu thi tao `data_overwrite_requests`
  - admin co khung phe duyet ghi de ngay trong man Tiep nhan du lieu
  - sau khi tao yeu cau ghi de, file duoc bo khoi hang cho thay vi bi giu lai
- Mo rong `src/supabaseStore.ts` va `src/types.ts` cho `OverwriteRequestRecord`.
- Them SQL rollout `supabase/unit_user_rollout.sql`.
- Them script `scripts/sync-supabase-unit-profiles.mjs` va npm script `auth:sync-unit-profiles` de dong bo 132 auth users vao `user_profiles`.
- Them tai lieu van hanh `docs/unit-user-rollout-guide.md`.

Kiem tra:
- `npm.cmd run lint`: pass
- `npm.cmd run build`: pass
- `npm.cmd run check:encoding`: fail do trong repo con nhieu chuoi mojibake ton tai tu truoc o `src/App.tsx`, `src/components/ImportFiles.tsx`, `src/supabaseStore.ts` va mot so docs. Loi nay da duoc ghi nhan rieng, nhung khong can tro build/runtime cua rollout moi.

### Backup local va backup Supabase truoc rollout unit_user ngay 2026-04-06

Yeu cau user:
- Tao backup toan bo he thong dang chay truoc khi chay rollout 132 tai khoan don vi.
- Can co backup local codebase va backup du lieu tren Supabase project.

Da thuc hien:
- Tao snapshot local tai `backups/2026-04-06_185755-pre-unit-user-rollout`.
- Tao script `scripts/backup-supabase-project.mjs` de backup du lieu cloud tu Supabase ra JSON.
- Them npm script `backup:supabase`.
- Tao tai lieu `docs/backup-guide.md`.

Luu y:
- Backup local da tao xong.
- Backup cloud chua chay tu day vi can user nap `SUPABASE_SERVICE_ROLE_KEY` moi vao PowerShell va chay lenh `npm.cmd run backup:supabase`.

### S?a g?p l?i font Dashboard và Ti?p nh?n d? li?u ngày 2026-04-06

Yêu c?u user:
- Dashboard và màn Ti?p nh?n d? li?u b? mojibake tr? l?i sau các thay d?i g?n dây.
- C?n s?a ngay nhung không làm ?nh hu?ng logic các ph?n khác.

Ðã th?c hi?n:
- Rà l?i các chu?i hi?n th? trong `C:\CODE_APPWEB\src\App.tsx` cho các kh?i Dashboard:
  - banner tiêu d?
  - ch?n d? án / nam
  - th? th?ng kê
  - nh?t ký ti?p nh?n
  - bi?u d? ti?p nh?n
  - popup yêu c?u dang nh?p
- Rà l?i các chu?i hi?n th? trong `C:\CODE_APPWEB\src\components\ImportFiles.tsx` cho:
  - tiêu d? màn hình
  - kh?i d? án / bi?u m?u / qu?n tr? d? li?u theo nam
  - kh?i phê duy?t ghi dè
  - uploader file / thu m?c
  - danh sách file ch? ti?p nh?n
  - popup ti?n d? và popup t?ng k?t ti?p nh?n
- Gi? nguyên logic nghi?p v? c?a rollout `unit_user`, ch? s?a chu?i hi?n th? và khôi ph?c các block JSX b? ?nh hu?ng.

Kiem tra:
- `npm.cmd run lint`: pass
- `npm.cmd run build`: pass

## 2026-04-06 19:40 - S?a tri?t ?? l?i m? h?a ? Dashboard v? Ti?p nh?n d? li?u

?? th?c hi?n:
- R? l?i to?n b? chu?i hi?n th? trong `C:\CODE_APPWEB\src\App.tsx` ph?c v? Dashboard v? c?c nh?n d?ng chung li?n quan tr?c ti?p ??n m?n n?y.
- R? l?i to?n b? chu?i hi?n th? trong `C:\CODE_APPWEB\src\components\ImportFiles.tsx`, bao g?m ti?u ?? m?n h?nh, b? l?c, ti?n tr?nh x? l?, t?ng k?t ti?p nh?n, th?ng b?o l?i v? kh?i ph? duy?t ghi ??.
- Kh?i ph?c c?c chu?i ?? b? h?ng do m? h?a cp1252/UTF-8 v? c?c chu?i ?? b? thay th?nh d?u h?i `?` trong l?n s?a tr??c.
- Kh?ng thay ??i logic nghi?p v? c?a Dashboard ho?c lu?ng ti?p nh?n d? li?u.

Ki?m tra:
- `npm.cmd run lint`: pass
- `npm.cmd run build`: pass
