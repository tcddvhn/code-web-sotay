# Ma Trận Kiểm Thử Quyền Theo Lớp Phòng Ban

Tài liệu này dùng để test nhanh sau khi chạy:

- `supabase/departments_rollout.sql`
- `supabase/unit_user_rollout.sql`
- `supabase/ai_analysis_setup.sql`
- `supabase/department_access_hardening.sql`

## 1. Vai trò cần test

- `admin`
- `contributor manager`
- `contributor member`
- `unit_user`
- `contributor` chưa được gán phòng ban

## 2. Kỳ vọng theo từng vai

### 2.1. Admin

- Nhìn thấy toàn bộ dự án.
- Vào được:
  - `Dự án`
  - `Biểu mẫu`
  - `Tiếp nhận dữ liệu`
  - `Báo cáo`
  - `Trích báo cáo`
  - `Phân tích AI`
  - `Cài đặt`
- Tạo, sửa, đổi trạng thái dự án.
- Xóa dự án.
- Quản lý:
  - đơn vị
  - tài khoản đơn vị
  - tài khoản nội bộ
  - phòng ban
  - thành viên phòng ban

### 2.2. Contributor manager

- Chỉ nhìn thấy dự án có `owner_department_id` đúng phòng của mình.
- Vào được:
  - `Dự án`
  - `Biểu mẫu`
  - `Tiếp nhận dữ liệu`
  - `Báo cáo`
  - `Trích báo cáo`
- Không vào được:
  - `Phân tích AI`
  - `Cài đặt`
- Tạo được dự án mới và dự án mới tự gắn phòng ban hiện tại.
- Sửa được dự án của phòng mình.
- Không xóa được dự án.

### 2.3. Contributor member

- Chỉ nhìn thấy dự án có `owner_department_id` đúng phòng của mình.
- Vào được:
  - `Tiếp nhận dữ liệu`
  - `Báo cáo`
  - `Trích báo cáo`
- Không vào được:
  - `Dự án`
  - `Biểu mẫu`
  - `Phân tích AI`
  - `Cài đặt`
- Không tạo/sửa/xóa dự án.

### 2.4. Unit user

- Không dùng lớp phòng ban.
- Chỉ nhìn thấy dự án mà đơn vị của tài khoản nằm trong phạm vi `project_units`.
- Vào được:
  - `Tiếp nhận dữ liệu`
  - `Báo cáo`
- Không vào được:
  - `Dự án`
  - `Biểu mẫu`
  - `Trích báo cáo`
  - `Phân tích AI`
  - `Cài đặt`

### 2.5. Contributor chưa được gán phòng ban

- Không nhìn thấy dự án nào.
- Không vào được:
  - `Dự án`
  - `Biểu mẫu`
  - `Tiếp nhận dữ liệu`
  - `Báo cáo`
  - `Trích báo cáo`
  - `Phân tích AI`
  - `Cài đặt`
- Dashboard vẫn mở được nhưng không có phạm vi dự án.

## 3. Checklist thao tác

### 3.1. Cài đặt

- Admin mở `Cài đặt`.
- Kiểm tra đúng 5 phòng ban:
  - `PB01` Phòng Tổ chức đảng, đảng viên
  - `PB02` Phòng Bảo vệ chính trị Nội bộ
  - `PB03` Phòng Tổ chức cán bộ
  - `PB04` Phòng địa bàn xã, phường
  - `PB05` Văn phòng ban
- Thêm 1 tài khoản nội bộ mới.
- Gán tài khoản đó vào một phòng ban với vai trò `manager`.
- Gán một tài khoản khác vào cùng phòng ban với vai trò `member`.

### 3.2. Dự án

- Đăng nhập bằng `manager`.
- Tạo dự án mới.
- Kiểm tra dự án chỉ hiện trong phòng mình.
- Đăng nhập bằng `member`.
- Kiểm tra vẫn nhìn thấy dự án đó nhưng không có quyền vào `Dự án`.
- Đăng nhập bằng `admin`.
- Kiểm tra vẫn nhìn thấy toàn bộ.

### 3.3. Biểu mẫu

- `manager` vào `Biểu mẫu`, tạo/sửa một biểu của dự án phòng mình.
- `member` không nhìn thấy menu `Biểu mẫu`.

### 3.4. Tiếp nhận dữ liệu / Báo cáo / Trích báo cáo

- `manager` vào đủ 3 màn hình, chỉ thấy phạm vi dự án phòng mình.
- `member` vào đủ 3 màn hình, chỉ thấy phạm vi dự án phòng mình.
- `unit_user` chỉ thấy phạm vi đơn vị mình.

### 3.5. Phân tích AI

- `admin` vào được.
- `manager` không vào được.
- `member` không vào được.
- `unit_user` không vào được.

## 4. Điểm cần chú ý khi test

- Nếu contributor nội bộ nhìn thấy toàn bộ dự án, phải kiểm tra:
  - `department_members` đã gán đúng chưa
  - SQL hardening đã chạy đủ chưa
- Nếu `Phân tích AI` vẫn thấy dự án ngoài phòng mình, phải kiểm tra:
  - runtime đang dùng `visibleProjects`
  - policy `analysis_cells` và `ai_analysis_reports`
- Nếu người theo dõi không xuất hiện trong `Quản lý danh sách đơn vị`, phải kiểm tra:
  - tài khoản đó đã được tạo ở `Quản trị tài khoản nội bộ`
  - `user_profiles.role` đang là `admin` hoặc `contributor`

## 5. Mục tiêu chốt hạng mục

Hạng mục phòng ban chỉ được coi là hoàn tất khi:

- 5 phòng ban mặc định có sẵn và đúng tên.
- Có thể tạo tài khoản nội bộ ngay trong `Cài đặt`.
- Có thể gán thành viên phòng ban ngay trong `Cài đặt`.
- Runtime không còn bypass phạm vi phòng ban.
- Backend RLS không còn cho manager xóa dự án.
- Test đủ 5 vai ở trên đều ra đúng kết quả.
