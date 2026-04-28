# Sổ Theo Dõi Tổng Hợp Hệ Thống Dữ Liệu

File này là tài liệu tổng hợp trung tâm cho hệ thống dữ liệu đang vận hành.  
Mục đích:

- liệt kê toàn bộ module và luồng xử lý chính
- ghi rõ các bảng dữ liệu, service, màn hình đang dùng
- nêu các vùng rủi ro kỹ thuật cần tránh
- làm nơi tham chiếu chính để mọi lần sửa tiếp theo đều cập nhật lịch sử

## 1. Nguyên tắc vận hành

### 1.1. Nguyên tắc thay đổi

- Không tự ý tác động vào hệ thống đang chạy nếu chưa được phê duyệt.
- Nếu thay đổi có thể ảnh hưởng hành vi đang vận hành, phải báo cáo trước khi sửa.
- Mọi thay đổi, lỗi phát sinh, cách xử lý và kế hoạch tiếp theo phải cập nhật vào thư mục `docs/`.

### 1.2. Nguyên tắc kiểm tra trước khi commit

Luôn chạy theo đúng thứ tự:

1. `npm run check:encoding`
2. `npm run lint`
3. `npm run build`

Ý nghĩa:

- `check:encoding`: phát hiện sớm chuỗi tiếng Việt lỗi mã hóa
- `lint`: bắt lỗi TypeScript
- `build`: xác nhận build production

## 2. Kiến trúc hiện tại

### 2.1. Frontend

- Framework: React + Vite + TypeScript
- File điều phối chính: `C:\CODE_APPWEB\src\App.tsx`

### 2.2. Backend / dịch vụ

- Supabase là nguồn dữ liệu và storage chính
- Supabase client: `C:\CODE_APPWEB\src\supabase.ts`
- CRUD dữ liệu nghiệp vụ: `C:\CODE_APPWEB\src\supabaseStore.ts`
- Truy vấn / tổng hợp báo cáo: `C:\CODE_APPWEB\src\supabaseReports.ts`

### 2.3. Thành phần giao diện chính

- `C:\CODE_APPWEB\src\components\Sidebar.tsx`
- `C:\CODE_APPWEB\src\components\ProjectManager.tsx`
- `C:\CODE_APPWEB\src\components\FormLearner.tsx`
- `C:\CODE_APPWEB\src\components\ImportFiles.tsx`
- `C:\CODE_APPWEB\src\components\ReportView.tsx`
- `C:\CODE_APPWEB\src\components\UnitAssignments.tsx`

### 2.4. Utility chính

- `C:\CODE_APPWEB\src\utils\excelParser.ts`
- `C:\CODE_APPWEB\src\utils\templateWorkbook.ts`
- `C:\CODE_APPWEB\src\utils\workbookUtils.ts`
- `C:\CODE_APPWEB\src\utils\reportingYear.ts`
- `C:\CODE_APPWEB\src\utils\columnUtils.ts`

## 3. Các module đang vận hành

### 3.1. Dashboard

Vai trò:

- hiển thị tổng quan theo dự án / năm
- hiển thị trạng thái tiếp nhận đơn vị
- hiển thị thống kê theo phạm vi phân quyền

File chính:

- `C:\CODE_APPWEB\src\App.tsx`

Logic chính:

- `admin`: thấy toàn bộ đơn vị trong phạm vi dự án
- `contributor`: chỉ thấy đơn vị được giao trong `global_assignments`
- số liệu `đã tiếp nhận / chưa tiếp nhận` phải dùng cùng một logic giữa dashboard và nhật ký

### 3.2. Dự án

Vai trò:

- tạo mới, sửa, đổi trạng thái, xóa dự án

File chính:

- `C:\CODE_APPWEB\src\components\ProjectManager.tsx`
- `C:\CODE_APPWEB\src\App.tsx`

Lưu ý:

- không thay `projectId` sau khi tạo
- chống tạo trùng tên dự án

### 3.3. Biểu mẫu

Vai trò:

- tạo biểu mẫu AI / thủ công
- lưu cấu hình đọc dữ liệu
- lưu workbook mẫu gốc để dùng cho export

File chính:

- `C:\CODE_APPWEB\src\components\FormLearner.tsx`

Thông số quan trọng:

- `sheetName`
- `headerLayout`
- `columnMapping`
- `blocks`
- `sourceWorkbookName`
- `sourceWorkbookPath`
- `sourceWorkbookUrl`
- `columnMapping.sheetSignature`

### 3.4. Tiếp nhận dữ liệu

Vai trò:

- nhận file đơn lẻ hoặc cả thư mục
- gợi ý đơn vị từ tên file
- kiểm tra hợp lệ trước khi ghi dữ liệu
- upload file hợp lệ lên storage
- ghi dữ liệu vào hệ thống

File chính:

- `C:\CODE_APPWEB\src\components\ImportFiles.tsx`

Kiểm tra hiện tại:

- khớp tên sheet bắt buộc
- khớp chỉ số khóa sheet nếu template đã cấu hình

### 3.5. Báo cáo

Vai trò:

- hiển thị bảng tổng hợp theo dự án / năm / đơn vị / biểu mẫu
- cho phép xem chi tiết ô dữ liệu
- export toàn bộ biểu

File chính:

- `C:\CODE_APPWEB\src\components\ReportView.tsx`

Lưu ý:

- cách hiển thị biểu hiện tại phải được giữ ổn định
- nút `Xuất biểu đang chọn` đã bỏ
- chỉ còn `Xuất toàn bộ biểu`
- nếu chọn `Đảng bộ Thành phố`, export phải ưu tiên workbook mẫu lúc tạo biểu

### 3.6. Cài đặt

Vai trò:

- quản lý đường dẫn lưu trữ
- quản lý danh sách đơn vị
- quản lý cấu hình hệ thống

File chính:

- `C:\CODE_APPWEB\src\App.tsx`

Lưu ý:

- đây là vùng nhạy cảm vì dùng chung nhiều text tiếng Việt

### 3.7. Phân công theo dõi đơn vị

Vai trò:

- admin gán người theo dõi đơn vị
- contributor chỉ thấy đơn vị được giao

File chính:

- `C:\CODE_APPWEB\src\components\UnitAssignments.tsx`
- `C:\CODE_APPWEB\src\App.tsx`

### 3.8. Tác vụ quản trị tài khoản Supabase Auth

Vai trò:

- tạo hàng loạt tài khoản đăng nhập theo file Excel
- phục vụ nhập người dùng vào `Supabase Authentication > Users`

File chính:

- `C:\CODE_APPWEB\scripts\import-supabase-auth-users.mjs`

Tài liệu vận hành:

- `C:\CODE_APPWEB\docs\supabase-auth-bulk-import-guide.md`

Lưu ý:

- script này dùng `SUPABASE_SERVICE_ROLE_KEY`
- chỉ chạy local hoặc server-side
- không đưa key vào frontend hoặc source công khai

### 3.8. Phân tích AI

Vai trò:

- chọn nhiều dự án / năm / biểu / đơn vị để phân tích
- tạo preview báo cáo AI
- xuất `DOCX` chuẩn văn phòng

Trạng thái hiện tại:

- đã có UI preview trong app
- chưa nối AI thật
- chưa can thiệp luồng vận hành hiện tại

File chính:

- `C:\CODE_APPWEB\src\components\AIAnalysisView.tsx`
- `C:\CODE_APPWEB\src\aiAnalysisStore.ts`

SQL nền:

- `C:\CODE_APPWEB\supabase\ai_analysis_setup.sql`

## 4. Luồng xử lý chính

### 4.1. Luồng tạo biểu mẫu

1. Người dùng chọn dự án
2. Người dùng tạo biểu mẫu bằng AI hoặc thủ công
3. Hệ thống đọc workbook mẫu
4. Hệ thống lưu:
   - cấu hình biểu mẫu
   - workbook mẫu gốc
   - layout header
   - chỉ số khóa sheet nếu có cấu hình

### 4.2. Luồng tiếp nhận dữ liệu

1. Người dùng chọn dự án / năm / biểu mẫu
2. Người dùng chọn file hoặc thư mục
3. Hệ thống gợi ý đơn vị từ tên file
4. Hệ thống kiểm tra workbook:
   - đủ sheet bắt buộc
   - đúng chỉ số khóa sheet
5. Nếu hợp lệ:
   - parse dữ liệu
   - ghi vào hệ thống
   - upload file đã tiếp nhận lên storage
6. Nếu không hợp lệ:
   - bỏ qua file
   - gộp lỗi vào tổng kết cuối đợt

### 4.3. Luồng dashboard

1. Người dùng chọn dự án / năm
2. Hệ thống tải dữ liệu theo phạm vi phân quyền
3. Hệ thống tính:
   - tổng số đơn vị
   - số đã tiếp nhận
   - số chưa tiếp nhận
   - tỷ lệ hoàn thành

### 4.4. Luồng báo cáo

1. Người dùng chọn dự án / năm / đơn vị
2. Hệ thống tải dữ liệu tổng hợp
3. Hệ thống render bảng theo:
   - bảng thường
   - hoặc layout workbook-based
4. Khi export:
   - dùng `Xuất toàn bộ biểu`
   - nếu là `Đảng bộ Thành phố`, dùng workbook mẫu làm nền

### 4.5. Luồng phân tích AI (giai đoạn thiết kế)

1. Người dùng vào `Phân tích AI`
2. Chọn nhiều dự án / năm / phạm vi
3. Chọn loại phân tích, giọng văn, độ dài
4. Hệ thống sẽ dùng lớp dữ liệu phân tích riêng
5. AI sinh JSON kết quả
6. Hệ thống render preview
7. Hệ thống xuất `DOCX`

## 5. Mô hình dữ liệu Supabase

Các bảng chính:

- `projects`
- `templates`
- `units`
- `app_settings`
- `user_profiles`
- `assignments`
- `global_assignments`
- `consolidated_rows`
- `data_files`
- `report_exports`
- `analysis_cells`
- `ai_analysis_reports`

SQL liên quan:

- `C:\CODE_APPWEB\supabase\schema.sql`
- `C:\CODE_APPWEB\supabase\global_assignments_setup.sql`
- `C:\CODE_APPWEB\supabase\report_rpc.sql`
- `C:\CODE_APPWEB\supabase\rls_hardening.sql`
- `C:\CODE_APPWEB\supabase\storage_setup.sql`
- `C:\CODE_APPWEB\supabase\ai_analysis_setup.sql`
- `C:\CODE_APPWEB\supabase\user_profiles_setup.sql`

## 6. Điểm nóng kỹ thuật cần tránh

### 6.1. Lỗi mã hóa tiếng Việt

Rủi ro:

- các file shared như `App.tsx`, `ReportView.tsx`, `ImportFiles.tsx`, `Sidebar.tsx`
- docs cũ bị mojibake dễ làm lan lỗi khi copy-sửa

Biện pháp:

- luôn chạy `npm run check:encoding`
- hạn chế rewrite nguyên file shared nếu không cần
- kiểm tra kỹ text tiếng Việt sau mỗi lần sửa

### 6.2. Regression ở màn Báo cáo

Rủi ro:

- sửa logic export nhưng vô tình làm thay đổi cách render bảng

Biện pháp:

- tách bạch:
  - logic export
  - logic render
- nếu phải sửa render, cần đối chiếu ảnh hoặc file cũ trước

### 6.3. Regression ở Dashboard / RBAC

Rủi ro:

- dashboard admin và contributor tính khác nhau

Biện pháp:

- mọi thay đổi query phải so sánh:
  - admin xem user A
  - user A đăng nhập trực tiếp

## 7. Quy tắc ghi lịch sử từ bây giờ

Mỗi lần sửa tiếp theo phải cập nhật vào:

1. `C:\CODE_APPWEB\docs\system-data-maintenance-log.md`
2. file này nếu thay đổi liên quan:
   - module
   - luồng xử lý
   - nguyên tắc vận hành
   - vùng rủi ro kỹ thuật

Nội dung tối thiểu cần ghi:

- ngày sửa
- yêu cầu của user
- file bị tác động
- rủi ro
- cách kiểm tra
- kết quả kiểm tra

## 8. Lịch sử thay đổi mức cao

### 2026-04-01

- ổn định lại hệ thống dữ liệu
- cập nhật các luồng dashboard / báo cáo / tiếp nhận
- hoàn thiện tài liệu handoff

### 2026-04-02

- sửa RBAC dashboard cho contributor và admin khớp nhau
- thêm quy trình `check:encoding`
- sửa export báo cáo theo workbook mẫu cho `Đảng bộ Thành phố`
- khôi phục cách hiển thị biểu cũ trong màn báo cáo
- thêm kéo thay đổi độ rộng cột trong báo cáo
- bổ sung `sheetSignature` cho biểu mẫu và kiểm tra tại bước tiếp nhận dữ liệu

## 9. Cách dùng tài liệu này

Khi tiếp tục ở máy khác hoặc ở phiên khác:

1. đọc file này trước
2. đọc tiếp `C:\CODE_APPWEB\docs\system-data-maintenance-log.md`
3. rà file code đúng module sắp sửa
4. chỉ sửa sau khi đã xác nhận phạm vi ảnh hưởng

## 10. Tiến độ hiện tại của module Phân tích AI

Đến mốc `2026-04-04`, module `Phân tích AI` đang ở trạng thái:

- đã có UI riêng trong app
- đã có bảng nền:
  - `analysis_cells`
  - `ai_analysis_reports`
- đã có lớp service:
  - `src/aiAnalysisStore.ts`
- đã nối đồng bộ `analysis_cells` theo kiểu `best-effort` vào các luồng:
  - nhập dữ liệu
  - xóa theo đơn vị
  - xóa theo năm
  - xóa theo biểu
  - xóa theo dự án
- đã có RPC summary riêng cho AI trong:
  - `supabase/ai_analysis_rpc.sql`
- UI `Phân tích AI` đã đọc summary thật nếu RPC sẵn sàng, và fallback mềm về số liệu ước tính nếu chưa có
- đã có lớp `src/aiAnalysisEngine.ts` để:
  - build payload phân tích từ summary + `analysis_cells`
  - gọi Gemini thật
  - render preview thật
  - lưu lịch sử thật vào `ai_analysis_reports`
- `Xuất DOCX` vẫn đang là pha sau, chưa kích hoạt runtime thật

Lưu ý vận hành:

- Nếu `analysis_cells` hoặc RPC lỗi, không được làm hỏng các luồng `Tiếp nhận dữ liệu`, `Báo cáo`, `Dashboard`
- Mọi chỗ đồng bộ `analysis_cells` hiện đều được bọc `try/catch` và chỉ log cảnh báo
- Để khối summary trong `Phân tích AI` chạy dữ liệu thật, cần chạy đủ:
  1. `supabase/ai_analysis_setup.sql`
  2. `supabase/ai_analysis_rpc.sql`

### Cập nhật thêm ngày 2026-04-04

- `Phân tích AI` hiện đã bắt đầu dùng `row_label + column_label` như chỉ tiêu nghiệp vụ thật, không còn chỉ bám `cell_count` / `row_count`.
- Đã thêm lớp `indicator summaries` phía client để build đầu vào AI theo tiêu chí thật.
- Đã thêm hỗ trợ `report blueprint`:
  - upload báo cáo mẫu
  - AI đọc mẫu để trích khung báo cáo
  - lưu blueprint vào `ai_report_blueprints` hoặc fallback `localStorage` nếu bảng chưa sẵn
- SQL mới cần chạy thêm để persist blueprint thật:
  3. `supabase/ai_report_blueprints.sql`

## 11. Rollout 132 tai khoan don vi (unit_user)

Trang thai hien tai:
- Da tao 132 tai khoan trong Supabase Auth.
- Frontend da co role `unit_user` va da tach menu / intake / report theo role nay.
- Luong ghi de du lieu da doi sang mo hinh xin phe duyet qua bang `data_overwrite_requests`.

Thanh phan lien quan:
- `src/App.tsx`: route guard, dashboard scope, bootstrap profile lan dau
- `src/components/Sidebar.tsx`: an menu voi `unit_user`
- `src/components/ImportFiles.tsx`: intake 1 file + overwrite approval
- `src/components/ReportView.tsx`: khoa bo loc don vi theo tai khoan
- `src/supabaseStore.ts`: CRUD `user_profiles`, `data_overwrite_requests`
- `supabase/unit_user_rollout.sql`: SQL rollout bat buoc tren Supabase
- `scripts/sync-supabase-unit-profiles.mjs`: dong bo 132 auth users vao `user_profiles`
- `docs/unit-user-rollout-guide.md`: huong dan van hanh

Checklist rollout:
1. Chay `supabase/unit_user_rollout.sql`
2. Chay `npm.cmd run auth:sync-unit-profiles -- --dry-run`
3. Chay `npm.cmd run auth:sync-unit-profiles`
4. Test 1 tai khoan don vi
5. Test 1 yeu cau ghi de va 1 lan admin phe duyet

Rui ro con mo:
- Repo con no ky thuat ve encoding/mojibake trong mot so file shared. Van build duoc, nhung can mot dot don rieng neu muon `check:encoding` xanh lai.
- RLS hien chua khoa chat overwrite o muc backend cho `consolidated_rows`; luong overwrite hien dang duoc khong che o UI + bang `data_overwrite_requests`. Neu can khoa sat hon thi phai tach them luong RPC/server-side cho import.

## Cap nhat 2026-04-07
- Man Cai dat hien la dau moi quan tri don vi, phan cong theo doi va ho so tai khoan don vi.
- Dashboard khong con chua UI phan cong theo doi don vi.
- Cac ho so tai khoan don vi trong UI dang quan ly bang user_profiles; viec tao/xoa Supabase Auth user that van la tac vu admin rieng ngoai frontend.

[2026-04-07 14:37:15] Project unit scope model
- New projects can now be created with a fixed unit scope.
- Scope is stored in project_units(project_id, unit_code).
- Runtime fallback: projects without explicit scope continue to behave as full-scope projects.
- UI editing of project scope after creation is intentionally not implemented.
[2026-04-08 07:51:14] Report navigation model
- Report navigation now uses a tree in the left panel: project -> unit.
- Right panel remains report-centric: year filter, unit filter, search, template tabs, report table, export actions.
- The project selector dropdown in ReportView has been removed.
- Dashboard banner now uses the Dong Son drum background asset from the repository.

## Report Navigation Model
- Current production direction: report tree lives in the left red sidebar, not inside the report content canvas.
- Tree structure: Project -> Tong hop cap thanh pho + project units.
- Report content panel no longer owns project/unit tree state; App.tsx owns that state and Sidebar is the primary selector.


## Report Layout Notes
- Current report UX keeps the tree in the red sidebar with a compact, unframed folder-tree presentation.
- The report canvas should maximize width for templates and tables; avoid reintroducing boxed tree controls or extra selector cards in the content panel.

- Report mode UI note (2026-04-08): report project/unit navigation now lives in the red left sidebar, not inside ReportView content. Sidebar width is user-resizable and persisted locally. Dashboard top project/year/status controls were flattened to inline underlined controls to reduce chrome and preserve horizontal space.

## Extract Report Module
- View id: EXTRACT_REPORTS
- Left menu item: Trich bao cao (not shown for unit_user)
- Component: C:\CODE_APPWEB\src\components\ExtractReportView.tsx
- Purpose: configure extraction blueprints on top of existing project templates and preview/export unit-by-unit extraction tables.
- Storage: table extract_report_blueprints (JSON field array for MVP).
- Catalog source: existing template metadata + resolved row labels from workbook source.
- Rollout SQL: C:\CODE_APPWEB\supabase\extract_reports_rollout.sql

## Deadline and Reminder Upgrade
- Projects now support a report deadline field (stored as deadlineAt in the frontend model and deadline_at in Supabase).
- Accepted submission history is tracked separately from the current effective file via project_unit_submission_events.
- Dashboard summary now has a second quality layer: on-time count, late count, and on-time rate, computed from the first accepted submission per project/unit/year.
- Unit-user bell notifications now also support PROJECT_DEADLINE_REMINDER records from app_notifications.
- Rollout SQL for this feature: C:\CODE_APPWEB\supabase\report_deadlines_rollout.sql.
- Scheduled implementation direction: DB-side reminder generation via pg_cron + public.generate_project_deadline_reminders(), not client-side lazy creation.
- Consistency rule after 2026-04-28 live test: accepted imports must upload/store the original source file and upsert data_files before consolidated_rows/submission events are written. If file storage fails, the unit file must be rejected instead of partially accepted. Report tree and Dashboard logs may fall back to consolidated_rows/project_unit_submission_events for legacy rows that were accepted before this rule. Hotfix SQL: C:\CODE_APPWEB\supabase\submission_consistency_patch.sql.
