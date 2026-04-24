# Checklist Hoàn Thiện Mô Hình Phòng Ban Chủ Quản Dự Án

Tài liệu này chốt lại trạng thái hiện tại của mô hình `phòng ban nội bộ -> sở hữu dự án`,
đối chiếu giữa ý tưởng đã thống nhất và code đang có trong repo.

## 1. Mục tiêu mô hình

- `departments` là lớp phòng ban nội bộ.
- `department_members` là lớp gán người dùng nội bộ vào phòng ban với vai trò `manager` hoặc `member`.
- `units` vẫn là 132 đơn vị trực thuộc, không bị trộn với phòng ban nội bộ.
- Mỗi `project` có đúng 1 `owner_department_id`.
- `admin` quản trị toàn hệ thống.
- `manager` quản lý dự án của phòng mình.
- `member` chỉ dùng trong phạm vi nội bộ đã được cho phép.
- `unit_user` tiếp tục đi theo luồng đơn vị như cũ.

## 2. Những gì đã có trong code

### 2.1. Dữ liệu và schema

- Đã có bảng `departments`.
- Đã có bảng `department_members`.
- Đã có `projects.owner_department_id`.
- Đã có `projects.created_by_email`.
- Đã có `projects.created_by_auth_user_id`.
- Đã có seed 5 phòng ban và backfill dự án cũ về `PB05`.
- 5 phòng ban chuẩn đang được chốt là:
  - `PB01` Phòng Tổ chức đảng, đảng viên
  - `PB02` Phòng Bảo vệ chính trị Nội bộ
  - `PB03` Phòng Tổ chức cán bộ
  - `PB04` Phòng địa bàn xã, phường
  - `PB05` Văn phòng ban

File liên quan:
- `supabase/schema.sql`
- `supabase/departments_rollout.sql`

### 2.2. Frontend types và store

- Đã có type:
  - `Department`
  - `DepartmentMember`
  - `DepartmentMembershipRole`
- Đã có CRUD:
  - `listDepartments`
  - `upsertDepartment`
  - `listDepartmentMembers`
  - `upsertDepartmentMember`
  - `deactivateDepartmentMember`

File liên quan:
- `src/types.ts`
- `src/supabaseStore.ts`

### 2.3. Runtime và UI

- `App.tsx` đã load `departments`, `departmentMembers`.
- Đã tính được:
  - `currentDepartmentMembership`
  - `currentDepartmentId`
  - `isDepartmentManager`
- `ProjectManager` đã hỗ trợ `ownerDepartmentId`.
- `Settings` đã có panel quản lý phòng ban và thành viên phòng ban.

File liên quan:
- `src/App.tsx`
- `src/components/ProjectManager.tsx`

## 3. Ma trận quyền nên chốt

| Module | Admin | Manager phòng | Member phòng | Unit user | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Dự án | Toàn quyền | Tạo/sửa dự án của phòng mình | Chỉ xem | Không dùng | Gần đúng |
| Biểu mẫu | Toàn quyền | Tạo/sửa biểu mẫu của dự án phòng mình | Chỉ xem | Không dùng | Gần đúng |
| Tiếp nhận dữ liệu | Toàn quyền | Dùng trên dự án phòng mình | Dùng trong phạm vi phòng mình | Theo `project_units` | Đã chốt theo hướng bảo thủ |
| Báo cáo | Toàn quyền | Xem/xuất trong phòng mình | Xem/xuất trong phạm vi phòng mình | Theo `project_units` | Đã chốt theo hướng bảo thủ |
| Trích báo cáo | Toàn quyền | Theo phòng mình | Theo phòng mình | Không dùng | Đã chốt theo hướng bảo thủ |
| Phân tích AI | Toàn quyền | Chưa mở | Chưa mở | Không dùng | Hiện giữ admin-only để an toàn |
| Cài đặt phòng ban | Toàn quyền | Không | Không | Không | Đúng |

## 4. Các việc còn phải làm

### 4.1. Đã vá trong runtime ngày 2026-04-24

- Contributor nội bộ không có `department membership` không còn thấy toàn bộ dự án nữa.
- `AIAnalysisView` không còn nhận toàn bộ `projects`; hiện đã nhận `visibleProjects`.
- Admin đăng nhập sẽ tự bootstrap 5 phòng ban mặc định nếu production đang thiếu hoặc đang sai tên hiển thị.

File đã sửa:
- `src/App.tsx`

### 4.2. Còn phải làm tiếp

1. Siết RLS cho các bảng dữ liệu nghiệp vụ
- `consolidated_rows`
- `data_files`
- `report_exports`
- `data_overwrite_requests`
- `analysis_cells`
- `ai_analysis_reports`

File rollout đã chuẩn bị:
- `supabase/department_access_hardening.sql`

Lưu ý:
- File này nên được chạy sau các rollout nền đã có:
  - `supabase/departments_rollout.sql`
  - `supabase/unit_user_rollout.sql`
  - `supabase/ai_analysis_setup.sql`

2. Rà lại policy đọc bảng nội bộ
- `department_members` hiện đang đọc khá rộng cho mọi `authenticated`
- nếu cần bảo mật hơn, phải thu hẹp theo `admin` hoặc theo phòng mình

3. Kiểm tra production
- `departments_rollout.sql` đã chạy thật chưa
- 5 phòng ban đã có đủ chưa
- `department_members` đã gán đủ chưa
- dự án cũ đã gán đúng `owner_department_id` thực tế chưa

4. Test theo 4 vai trò
- `admin`
- `contributor manager`
- `contributor member`
- `unit_user`

## 5. Kết luận

Mô hình phòng ban không còn ở mức ý tưởng nữa.
Repo hiện tại đã có nền dữ liệu, runtime, UI và một phần RLS cho mô hình này.

Việc còn lại để hoàn chỉnh là:
- khóa chặt quyền ở tất cả module
- siết tiếp backend/RLS
- chốt dứt điểm phạm vi của vai trò `member`
- kiểm tra rollout thực tế trên production
