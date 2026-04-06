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
