# Bàn Giao Hệ Thống Dữ Liệu - 2026-04-01

File này ghi lại toàn bộ lịch sử chỉnh sửa và trạng thái làm việc của nhánh `Hệ thống dữ liệu` kể từ lúc đọc lại dự án ở trạng thái mới nhất cho đến hiện tại, để tiếp tục trên máy khác mà không bị đứt mạch.

## 1. Nguyên tắc hiện tại

- Repo chính đang làm việc: `/Users/tranhau/Documents/GitHub/code-web-sotay`
- Phần `Sổ tay mới` đã bị ẩn khỏi giao diện desktop và mobile.
- Không tiếp tục triển khai handbook trừ khi user nói đúng câu: `hãy tiếp tục xây sổ tay mới`
- Trọng tâm hiện tại là hoàn thiện `Hệ thống dữ liệu`.

## 2. Các thay đổi đã làm sau khi đọc lại dự án

### 2.1. Ẩn toàn bộ `Sổ tay mới`

Đã thực hiện:
- Ẩn mục `Sổ tay mới` khỏi sidebar desktop
- Ẩn nút menu nổi mobile dẫn vào handbook
- Nếu app còn giữ state cũ trỏ vào `HANDBOOK`, tự quay về `DASHBOARD`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/Sidebar.tsx`

Ghi chú:
- Code handbook vẫn còn trong repo, chỉ bị ẩn khỏi UI

### 2.2. Sửa lỗi crash sau khi ẩn handbook

Đã xử lý:
- Lỗi `X is not defined` khi mở popup `Nhật ký`
- Nguyên nhân: icon `X` vẫn dùng trong popup nhưng import bị bỏ

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`

### 2.3. Rà soát lại font/Unicode

Đã rà:
- Chuỗi tiếng Việt ở `src`, `docs`, các file text chính
- Không còn thấy lỗi vỡ font/mã hóa rõ rệt trong phần đang chạy

## 3. Các thay đổi lớn ở module `Tiếp nhận dữ liệu`

### 3.1. Tái cấu trúc layout chọn dữ liệu đầu màn hình

Đã làm:
- `Dự án` chuyển từ dạng hẹp sang bố cục ngang rộng hơn
- `Biểu mẫu` chuyển sang các thẻ ngang
- `Năm tổng hợp` đã được đưa vào trong khung `Dự án`
- `Quản trị dữ liệu theo năm` chỉ hiện cho `admin`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ImportFiles.tsx`

### 3.2. Thêm khối `Đơn vị chưa tiếp nhận`

Đã làm:
- Hiển thị danh sách đơn vị chưa tiếp nhận ngay trong module `Tiếp nhận dữ liệu`
- Logic dữ liệu đồng bộ với `Nhật ký`
- Contributor chỉ thấy đơn vị thuộc phạm vi phân công theo dõi

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ImportFiles.tsx`

### 3.3. Thêm filter `Đơn vị đã có dữ liệu`

Đã làm:
- Bổ sung option lọc mới trong `Danh sách file chờ tiếp nhận`
- Kết hợp với `project + year + RBAC`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ImportFiles.tsx`

### 3.4. Nâng UX tiến độ và kết quả tiếp nhận

Đã làm ở các lượt trước và vẫn đang có hiệu lực:
- Popup tiến độ cho:
  - `Bắt đầu tổng hợp`
  - `Xóa dữ liệu theo năm`
  - `Xóa toàn bộ dự án hiện tại`
- Popup kết quả sau tiếp nhận:
  - số đơn vị cập nhật thành công
  - số đơn vị lỗi
  - danh sách file lỗi và nguyên nhân

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ImportFiles.tsx`

## 4. Các thay đổi lớn ở `Dashboard`

### 4.1. Dashboard mobile

Đã làm:
- Tối ưu lại nhiều phần hiển thị trên điện thoại
- Nhật ký mobile gọn hơn
- Các khối tiến độ và danh sách preview đơn vị đã được rút gọn
- Với user chưa đăng nhập:
  - bấm vào `Nhật ký` sẽ hiện popup yêu cầu đăng nhập
- Với user đã đăng nhập:
  - chỉ xem chi tiết đơn vị thuộc phạm vi phân công của mình

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`

### 4.2. Dashboard desktop

Đã làm:
- Bỏ dòng `Năm tổng hợp 20xx` trên đầu khung
- Thêm banner ngang đỏ, chữ trắng đậm:
  - `HỆ THỐNG QUẢN TRỊ DỮ LIỆU TCĐ, ĐV TẬP TRUNG`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`

## 5. Các thay đổi ở `Báo cáo`

### 5.1. Bộ lọc đơn vị

Đã làm:
- `Chọn đơn vị` chỉ hiện các đơn vị đã thực sự có dữ liệu theo `dự án + năm`
- Có fallback từ `dataFiles` và dữ liệu tổng hợp

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ReportView.tsx`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`

### 5.2. Popup chi tiết ô dữ liệu

Đã làm:
- Ẩn các đơn vị có giá trị `0`
- Thêm dòng `Có số liệu: X đơn vị`
- Sắp xếp theo `mã đơn vị tăng dần`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ReportView.tsx`

## 6. Các thay đổi ở `Dự án`

### 6.1. Chống tạo trùng tên dự án

Đã làm:
- Chặn tạo 2 dự án trùng tên
- So sánh có chuẩn hóa khoảng trắng và không phân biệt hoa/thường

### 6.2. Sửa tên dự án

Đã làm:
- Cho phép sửa `tên dự án` và `mô tả`
- Không đổi `projectId`, nên không làm gãy dữ liệu liên quan

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ProjectManager.tsx`

## 7. Phân công theo dõi đơn vị

### 7.1. Đã chuyển sang bảng dùng chung toàn hệ thống

Đã làm:
- Không còn phụ thuộc runtime vào một dự án cụ thể
- `Dashboard` vẫn giữ bộ lọc theo `người theo dõi`
- Admin mới thấy phần quản lý phân công

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/App.tsx`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/UnitAssignments.tsx`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/supabaseStore.ts`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/supabase/global_assignments_setup.sql`

## 8. Nhánh `Biểu mẫu` - phần đang làm gần nhất

Đây là phần quan trọng nhất của ngày hôm nay.

### 8.1. Bài toán mới từ file `Bieu-4C.xlsx`

File nguồn:
- `/Users/tranhau/Downloads/Bieu-4C.xlsx`

Hai sheet cần hỗ trợ:

#### `B1`
- Tiêu chí dọc không còn là 1 cột đơn
- Vùng nhãn thực tế là `A:B`
- Cột nhãn chính là `B`

#### `B2`
- Không phải một bảng liên tục
- Có 3 `khối tiêu đề - dữ liệu`:
  - `A7:I9` -> dữ liệu ở dòng `10`
  - `A11:I13` -> dữ liệu ở dòng `14`
  - `A15:I17` -> dữ liệu ở dòng `18`

### 8.2. Mở rộng schema cấu hình biểu mẫu

Đã thêm vào `types`:
- `labelColumnStart`
- `labelColumnEnd`
- `primaryLabelColumn`
- `blocks?: TemplateBlockConfig[]`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/types.ts`

### 8.3. Mở rộng UI `FormLearner`

Đã làm:
- Thêm cấu hình cho vùng tiêu chí dọc nhiều cột
- Thêm cấu hình `khối tiêu đề - dữ liệu`
- Có `Điền nhanh B1`
- Có `Điền nhanh B2`
- Đổi chữ cho dễ hiểu hơn:
  - `Cột chứa tên tiêu chí chính`
  - `Tiêu đề trên bắt đầu từ dòng`
  - `Tiêu đề dưới kết thúc ở dòng`
  - `Dòng chứa số liệu bắt đầu`
  - `Dòng chứa số liệu kết thúc`
  - `Dòng đặc biệt bỏ qua khi tổng hợp`
- Đã bỏ khung `Hướng dẫn thiết lập`
- Đã dọn layout `1. Tiêu chí dọc`, `2. Tiêu chí ngang`, `3. Vùng lấy dữ liệu` sang dạng dòng thông số dễ đọc hơn

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/FormLearner.tsx`

### 8.4. Sửa preview/render của `B1/B2`

Đã làm ở `ReportView`:
- Thêm nhánh render mới cho template nâng cao
- Nếu template có:
  - `blocks`
  - hoặc `labelColumnStart != labelColumnEnd`
  thì hệ thống sẽ dựng lại layout từ workbook thật thay vì bảng liên tục

Kết quả mong muốn:
- `B1` hiển thị được vùng nhãn `A:B`
- `B2` hiển thị thành 3 khối
- không còn rơi các dòng kiểu `Dòng 10`, `Dòng 14`, `Dòng 18` xuống cuối như trước

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ReportView.tsx`
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/utils/templateWorkbook.ts`

### 8.5. Sửa parser cho `B1/B2`

Đã làm:
- `B1`: parser đọc nhãn theo vùng `labelColumnStart -> labelColumnEnd`
- `B2`: parser đọc theo từng `khối tiêu đề - dữ liệu`
- Nếu hàng dữ liệu không có nhãn riêng, hệ thống lấy nhãn theo tiêu đề khối thay vì sinh `Dòng X`

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/utils/excelParser.ts`

### 8.6. Sửa export workbook cho template nâng cao

Đã làm:
- Khi template có `blocks`, export sẽ ghi giá trị theo từng khối
- Không còn ép toàn sheet chạy theo một vùng liên tục

File liên quan:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ReportView.tsx`

## 9. Các lỗi đã phát sinh và đã xử lý

### 9.1. Lỗi build JSX ở `FormLearner`

Đã xử lý:
- Vercel báo `Expected "}" but found ";"` ở cuối file
- Nguyên nhân: thiếu `</div>` sau khi bỏ panel hướng dẫn

File:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/FormLearner.tsx`

### 9.2. Lỗi runtime `columnLetterToIndex is not defined`

Đã xử lý:
- Nguyên nhân: `ReportView` dùng helper này trong nhánh render mới nhưng chưa import

File:
- `/Users/tranhau/Documents/GitHub/code-web-sotay/src/components/ReportView.tsx`

## 10. Những gì chưa thể xác nhận hoàn toàn

Vì máy hiện tại không có `node/npm` trong `PATH`, chưa tự chạy được:
- `npm run build`
- `npm run dev`
- `npm run lint`

Vì vậy các thay đổi đã được sửa theo:
- đọc code
- đối chiếu workbook thật
- vá theo logic
- sửa các lỗi build/runtime do user chụp lại

## 11. Trạng thái hiện tại cần test trên máy khác

Khi sang máy khác, cần test đúng chuỗi sau:

1. Vào `Biểu mẫu`
2. Chọn `Điền nhanh B1`
3. Chọn `Điền nhanh B2`
4. Lưu biểu mẫu
5. Vào `Báo cáo`
6. Kiểm tra:
   - `B1` có hiện đúng vùng nhãn nhiều cột không
   - `B2` có hiện đúng 3 khối không
   - có còn `Dòng 10 / Dòng 14 / Dòng 18` rơi xuống dưới không
7. Vào `Tiếp nhận dữ liệu`
8. Nhập file thật theo biểu đó
9. Kiểm tra lại `Báo cáo`
10. Thử `Xuất biểu`

## 12. Việc cần làm tiếp nếu còn lỗi

Nếu `B2` vẫn chưa đúng hoàn toàn:

1. Rà lại trực tiếp `resolveTemplateRowLabels()` cho case block
2. Kiểm tra `openCellDetail()` có map đúng `sourceRow + columnIndex` của từng khối không
3. Nếu cần, thêm metadata `segmentId/blockId` vào `DataRow`
4. Sau đó chỉnh tiếp:
   - `supabaseReports.ts`
   - `supabaseStore.ts`
   - và schema DB nếu phải lưu block identity rõ hơn

## 13. Cách nhắc lại cho agent ở máy khác

Khi sang máy khác, chỉ cần nói:

`Đọc file docs/data-system-handoff-2026-04-01.md, rà lại src/components/FormLearner.tsx, src/components/ReportView.tsx, src/utils/excelParser.ts, src/utils/templateWorkbook.ts, rồi tiếp tục hoàn thiện B1/B2 nếu còn lỗi. Không động vào handbook mới vì đang tạm ẩn.`

