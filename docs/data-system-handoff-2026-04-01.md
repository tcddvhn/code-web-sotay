# Bàn Giao Hệ Thống Dữ Liệu - 2026-04-01

File này ghi lại trạng thái làm việc của nhánh `Hệ thống dữ liệu` để tiếp tục trên máy khác mà không bị đứt mạch.

## 1. Nguyên tắc hiện tại

- Không tiếp tục triển khai `Sổ tay mới` nếu không có yêu cầu rõ ràng.
- Trọng tâm hiện tại là `Hệ thống dữ liệu`.
- Mọi thay đổi có nguy cơ ảnh hưởng hệ thống đang chạy phải được user phê duyệt trước.
- Mọi thay đổi phải được ghi lại trong thư mục `docs/`.

## 2. Trạng thái tổng quát của dự án

- Handbook đã bị gỡ hoặc ẩn khỏi giao diện vận hành.
- Hệ thống đang tập trung vào các module:
  - `Dashboard`
  - `Dự án`
  - `Biểu mẫu`
  - `Tiếp nhận dữ liệu`
  - `Báo cáo`
  - `Cài đặt`

## 3. Các thay đổi đã làm ở hệ thống dữ liệu

### 3.1. Tiếp nhận dữ liệu

Đã làm:

- tái cấu trúc layout đầu màn hình để dễ dùng hơn
- thêm danh sách `Đơn vị chưa tiếp nhận`
- thêm filter `Đơn vị đã có dữ liệu`
- thêm popup tiến độ và popup kết quả sau tiếp nhận
- hỗ trợ chọn file hoặc chọn thư mục dữ liệu

File liên quan:

- `C:\CODE_APPWEB\src\components\ImportFiles.tsx`

### 3.2. Dashboard

Đã làm:

- sửa logic RBAC để contributor chỉ thấy đúng đơn vị được giao
- đồng bộ số liệu `Đã tiếp nhận / Chưa tiếp nhận` giữa admin và user được phân công
- điều chỉnh UI desktop/mobile ở một số đợt sửa trước

File liên quan:

- `C:\CODE_APPWEB\src\App.tsx`

### 3.3. Dự án

Đã làm:

- chống tạo trùng tên dự án
- cho phép sửa tên dự án và mô tả
- không đổi `projectId`, nên không làm gãy dữ liệu liên quan

File liên quan:

- `C:\CODE_APPWEB\src\App.tsx`
- `C:\CODE_APPWEB\src\components\ProjectManager.tsx`

### 3.4. Phân công theo dõi đơn vị

Đã làm:

- chuyển sang bảng dùng chung toàn hệ thống
- admin quản lý phân công
- dashboard vẫn hỗ trợ lọc theo người theo dõi

File liên quan:

- `C:\CODE_APPWEB\src\App.tsx`
- `C:\CODE_APPWEB\src\components\UnitAssignments.tsx`
- `C:\CODE_APPWEB\src\supabaseStore.ts`
- `C:\CODE_APPWEB\supabase\global_assignments_setup.sql`

### 3.5. Báo cáo

Đã làm:

- bộ lọc đơn vị chỉ hiện các đơn vị đã thực sự có dữ liệu theo `dự án + năm`
- popup chi tiết ô dữ liệu:
  - ẩn các đơn vị có giá trị `0`
  - thêm thống kê số đơn vị có số liệu
  - sắp xếp theo mã đơn vị tăng dần
- đã đổi logic export:
  - bỏ `Xuất biểu đang chọn`
  - chỉ còn `Xuất toàn bộ biểu`
  - khi chọn `Đảng bộ Thành phố`, hệ thống bắt buộc ưu tiên workbook mẫu đã tải lên lúc tạo biểu

File liên quan:

- `C:\CODE_APPWEB\src\components\ReportView.tsx`
- `C:\CODE_APPWEB\src\utils\templateWorkbook.ts`
- `C:\CODE_APPWEB\src\supabase.ts`

## 4. Phần biểu mẫu B1 / B2

Đây là cụm thay đổi sâu đã từng làm trước đó để hỗ trợ biểu mẫu phức tạp.

### 4.1. Yêu cầu nghiệp vụ

Case gốc phát sinh từ workbook như `Bieu-4C.xlsx`, trong đó:

- `B1`:
  - tiêu chí dọc không chỉ nằm trong 1 cột
  - vùng nhãn thực tế là `A:B`
  - cột nhãn chính là `B`

- `B2`:
  - không phải bảng liên tục
  - có nhiều khối tiêu đề - dữ liệu

### 4.2. Đã mở rộng schema cấu hình biểu mẫu

Đã thêm vào `types`:

- `labelColumnStart`
- `labelColumnEnd`
- `primaryLabelColumn`
- `blocks`

File liên quan:

- `C:\CODE_APPWEB\src\types.ts`

### 4.3. Đã mở rộng `FormLearner`

Đã làm:

- thêm cấu hình vùng tiêu chí dọc nhiều cột
- thêm cấu hình `khối tiêu đề - dữ liệu`
- có cơ chế điền nhanh cho một số mẫu cấu hình
- dọn lại UI thiết lập biểu mẫu cho dễ đọc hơn

File liên quan:

- `C:\CODE_APPWEB\src\components\FormLearner.tsx`

### 4.4. Đã sửa parser và preview/export cho template nâng cao

Đã làm:

- parser đọc đúng theo vùng nhãn nhiều cột
- parser đọc đúng theo từng block
- `ReportView` và export workbook có nhánh xử lý template nâng cao

File liên quan:

- `C:\CODE_APPWEB\src\utils\excelParser.ts`
- `C:\CODE_APPWEB\src\utils\templateWorkbook.ts`
- `C:\CODE_APPWEB\src\components\ReportView.tsx`

## 5. Các lỗi đã từng phát sinh và đã xử lý

### 5.1. Crash sau khi ẩn handbook

Nguyên nhân:

- import icon `X` bị thiếu trong popup nhật ký

File:

- `C:\CODE_APPWEB\src\App.tsx`

### 5.2. Lỗi runtime `columnLetterToIndex is not defined`

Nguyên nhân:

- `ReportView` dùng helper nhưng chưa import

File:

- `C:\CODE_APPWEB\src\components\ReportView.tsx`

### 5.3. Lỗi build JSX ở `FormLearner`

Nguyên nhân:

- thiếu thẻ đóng sau khi bỏ panel hướng dẫn

File:

- `C:\CODE_APPWEB\src\components\FormLearner.tsx`

## 6. Quy trình kiểm tra trước khi commit

Luôn chạy theo đúng thứ tự:

1. `npm run check:encoding`
2. `npm run lint`
3. `npm run build`

Mục tiêu:

- phát hiện sớm lỗi mã hóa tiếng Việt
- phát hiện lỗi TypeScript
- phát hiện lỗi build production

## 7. Những gì cần test trên máy khác

Khi sang máy khác, nên test đúng chuỗi sau:

1. `Biểu mẫu`
2. `Tiếp nhận dữ liệu`
3. `Dashboard`
4. `Báo cáo`
5. `Xuất toàn bộ biểu`

Riêng với biểu mẫu phức tạp:

1. tạo hoặc lưu biểu mẫu
2. nhập file thực tế
3. mở lại `Báo cáo`
4. kiểm tra preview, chi tiết và export

## 8. Câu nhắc ngắn cho agent ở máy khác

Có thể dùng đúng câu sau:

`Đọc file docs/data-system-handoff-2026-04-01.md và docs/system-data-maintenance-log.md, rà lại các file src/components/FormLearner.tsx, src/components/ImportFiles.tsx, src/components/ReportView.tsx, src/App.tsx, rồi tiếp tục theo nguyên tắc không động vào hệ thống đang chạy nếu chưa được phê duyệt.`
