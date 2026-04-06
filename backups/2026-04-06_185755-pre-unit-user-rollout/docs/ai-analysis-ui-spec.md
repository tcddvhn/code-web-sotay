# Đặc Tả Giao Diện Module "Phân Tích AI"

Tài liệu này chốt giao diện cấp 2 cho module `Phân tích AI` trước khi triển khai schema, RPC và luồng AI phía dưới.

## 1. Mục tiêu

Module `Phân tích AI` dùng để:

- chọn nhiều dự án và phạm vi dữ liệu cần phân tích
- cấu hình kiểu báo cáo AI
- xem preview kết quả phân tích
- xuất file `DOCX` chuẩn văn phòng

Nguyên tắc:

- ưu tiên dễ hiểu với người dùng hành chính
- không lộ thuật ngữ kỹ thuật
- thao tác theo từng bước, rõ phạm vi dữ liệu đang dùng
- desktop tối ưu cho đọc và preview
- mobile tối ưu cho chọn nhanh và đọc dọc

## 2. Vị trí Trong Hệ Thống

Menu chính sẽ có thêm mục:

- `Phân tích AI`

Mục này ngang hàng với:

- `Dashboard`
- `Dự án`
- `Biểu mẫu`
- `Tiếp nhận dữ liệu`
- `Báo cáo`
- `Cài đặt`

## 3. Bố Cục Desktop

Trang desktop gồm 4 tầng chính:

1. `Phạm vi phân tích`
2. `Cấu hình phân tích`
3. `Preview kết quả`
4. `Xuất và lưu lịch sử`

### 3.1. Tầng 1 - Phạm vi phân tích

Hiển thị thành một khối lớn ở đầu trang, chia làm 2 hàng.

#### Hàng 1

- `Dự án`
  - loại control: `multi-select`
  - hỗ trợ tìm kiếm
  - có nút nhanh:
    - `Chọn tất cả dự án đang hoạt động`
    - `Bỏ chọn tất cả`
- `Năm`
  - loại control: `select`
  - bản đầu hỗ trợ:
    - chọn 1 năm
    - hoặc 2 năm khi dùng loại phân tích so sánh theo năm
- `Phạm vi`
  - loại control: `segmented control` hoặc `select`
  - giá trị:
    - `Toàn bộ dữ liệu đã chọn`
    - `Theo biểu`
    - `Theo đơn vị`
    - `So sánh giữa dự án`

#### Hàng 2

Điều kiện hiện theo `Phạm vi`:

- Nếu chọn `Theo biểu`
  - hiện `Biểu mẫu`
  - loại control: `multi-select`
- Nếu chọn `Theo đơn vị`
  - hiện `Đơn vị`
  - loại control: `multi-select`
- Nếu chọn `So sánh giữa dự án`
  - hiện `Kiểu so sánh`
  - giá trị:
    - `Theo tỷ lệ hoàn thành`
    - `Theo số lượng đơn vị đã tiếp nhận`
    - `Theo từng biểu mẫu`

#### Tóm tắt phạm vi

Ngay dưới các control có một khối thông tin nhỏ:

- `Dự án đã chọn: X`
- `Năm phân tích: 2026`
- `Biểu mẫu liên quan: Y`
- `Đơn vị có dữ liệu: Z`
- `Tổng số dòng tổng hợp: N`

Khối này phải cập nhật động khi user đổi phạm vi.

### 3.2. Tầng 2 - Cấu hình phân tích

Là một card lớn bên dưới `Phạm vi phân tích`.

Các trường:

- `Loại phân tích`
  - `Tóm tắt nhanh`
  - `Phân tích đầy đủ`
  - `So sánh theo năm`
  - `So sánh giữa dự án`
  - `Phân tích bất thường`
  - `Báo cáo lãnh đạo`

- `Giọng văn`
  - `Hành chính`
  - `Điều hành`
  - `Phân tích chuyên sâu`

- `Độ dài báo cáo`
  - `Ngắn`
  - `Trung bình`
  - `Dài`

- `Nội dung cần có`
  - loại control: checkbox group
  - gồm:
    - `Tổng quan số liệu`
    - `Điểm nổi bật`
    - `Đơn vị chậm cập nhật`
    - `So sánh giữa các dự án`
    - `So sánh theo năm`
    - `Kiến nghị / đề xuất`

- `Yêu cầu thêm`
  - loại control: textarea ngắn
  - placeholder ví dụ:
    - `Ví dụ: ưu tiên phân tích những dự án có tỷ lệ hoàn thành thấp`

Nút hành động chính:

- `Tạo phân tích AI`

Trạng thái nút:

- disabled nếu chưa chọn dự án hoặc chưa đủ điều kiện phạm vi

### 3.3. Tầng 3 - Preview kết quả

Bố cục 2 cột:

#### Cột trái

Khối thông tin điều hướng:

- `Phiên phân tích`
  - thời gian tạo
  - người tạo
  - loại phân tích
- `Dữ liệu đã dùng`
  - số dự án
  - năm
  - số biểu
  - số đơn vị
- `Mục lục báo cáo`
  - `1. Tóm tắt điều hành`
  - `2. Số liệu chính`
  - `3. Nhận xét nổi bật`
  - `4. Đơn vị cần lưu ý`
  - `5. Kiến nghị`
  - `6. Phụ lục`
- `Điểm chính`
  - 3-5 bullet rút ra từ kết quả

#### Cột phải

Khối preview chính:

- hiển thị nội dung báo cáo dạng đọc được ngay
- chia section rõ ràng
- hỗ trợ cuộn dọc
- có thể chọn/copy nội dung

Thanh công cụ phía trên preview:

- `Tạo lại`
- `Sửa yêu cầu`
- `Xuất DOCX`

### 3.4. Tầng 4 - Lưu và lịch sử

Nằm cuối trang hoặc tab phụ bên phải.

Gồm:

- `Lưu báo cáo này`
- `Tên báo cáo`
- `Ghi chú`
- `Lịch sử báo cáo gần đây`

Danh sách lịch sử gồm:

- tên báo cáo
- thời gian tạo
- người tạo
- nút `Mở lại`
- nút `Tải DOCX`

## 4. Bố Cục Mobile

Mobile đi theo 1 cột dọc, theo thứ tự:

1. `Phạm vi phân tích`
2. `Tóm tắt phạm vi`
3. `Cấu hình phân tích`
4. `Tạo phân tích AI`
5. `Preview kết quả`
6. `Xuất DOCX`
7. `Lịch sử gần đây`

### 4.1. Chọn nhiều dự án trên mobile

- vẫn dùng `multi-select`
- sau khi chọn xong, hiển thị thành `chip` cuộn ngang
- nếu chọn nhiều:
  - hiển thị `3 dự án đã chọn`
  - có thể bấm để mở lại danh sách chi tiết

### 4.2. Preview trên mobile

- không chia 2 cột
- phần `Mục lục` chuyển thành accordion
- phần `Điểm chính` đặt lên trước preview để người dùng nắm nhanh

### 4.3. Nút hành động trên mobile

Nút chính cố định cuối màn hình khi đã có đủ điều kiện:

- `Tạo phân tích AI`

Sau khi có kết quả:

- `Xuất DOCX`
- `Tạo lại`

## 5. Các Trạng Thái Giao Diện

### 5.1. Chưa chọn dữ liệu

Hiển thị trạng thái rỗng:

- `Chọn dự án, năm và phạm vi để bắt đầu phân tích`

### 5.2. Đang chạy AI

Hiển thị progress theo 3 bước:

- `Đang tổng hợp dữ liệu`
- `Đang phân tích`
- `Đang soạn báo cáo`

Nếu phạm vi lớn:

- hiện thêm note:
  - `Phạm vi phân tích lớn, thời gian xử lý có thể lâu hơn`

### 5.3. Có kết quả

Hiển thị:

- preview
- mục lục
- các nút hành động

### 5.4. Lỗi

Hiển thị lỗi rõ nghĩa:

- `Không thể tổng hợp dữ liệu cho phạm vi đã chọn`
- `Không thể tạo báo cáo AI, vui lòng thử lại`
- `Không thể xuất DOCX`

Kèm nút:

- `Thử lại`

## 6. Tên Chính Thức Của Các Control

Để thống nhất UI, dùng đúng các nhãn sau:

- `Phân tích AI`
- `Phạm vi phân tích`
- `Dự án`
- `Năm`
- `Phạm vi`
- `Biểu mẫu`
- `Đơn vị`
- `Tóm tắt phạm vi`
- `Loại phân tích`
- `Giọng văn`
- `Độ dài báo cáo`
- `Nội dung cần có`
- `Yêu cầu thêm`
- `Tạo phân tích AI`
- `Phiên phân tích`
- `Dữ liệu đã dùng`
- `Mục lục báo cáo`
- `Điểm chính`
- `Xuất DOCX`
- `Lịch sử báo cáo gần đây`

## 7. Các Quy Tắc UX Cần Giữ

- Không hiển thị quá nhiều control kỹ thuật cùng lúc.
- Khi chọn nhiều dự án phải luôn có phần `Tóm tắt phạm vi` để user biết AI đang đọc gì.
- Preview phải rõ section, không là một khối văn bản dài.
- `Xuất DOCX` chỉ sáng lên khi đã có kết quả hợp lệ.
- Mobile không cố nhồi 2 cột; ưu tiên đọc dọc.

## 8. Bước Tiếp Theo Sau Khi Chốt Giao Diện

Sau khi user chốt giao diện này, sẽ chuyển sang thiết kế kỹ thuật:

1. schema dữ liệu phân tích
2. bảng / view / RPC tổng hợp cho AI
3. cấu trúc prompt và output JSON
4. cơ chế xuất `DOCX` theo mẫu chuẩn văn phòng
