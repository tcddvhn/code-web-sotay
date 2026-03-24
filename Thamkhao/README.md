# Hệ thống Tổng hợp Dữ liệu Excel (Consolidation System v2.0)

Ứng dụng web chuyên dụng để tiếp nhận, xử lý và tổng hợp dữ liệu từ các file Excel báo cáo của các đơn vị thành viên. Tích hợp Firebase để lưu trữ dữ liệu trực tuyến và quản lý quyền truy cập Admin.

## 🚀 Tính năng chính
- **Tiếp nhận File:** Tự động đọc dữ liệu từ các biểu mẫu Excel (1B, 5A, 5B...) bằng thư viện `xlsx`.
- **Dashboard:** Biểu đồ trực quan về tỷ lệ nộp báo cáo và thống kê tổng quát.
- **Báo cáo:** Xem dữ liệu tổng hợp theo từng biểu mẫu, hỗ trợ lọc theo năm.
- **Firebase Integration:** 
  - Lưu trữ dữ liệu thời gian thực trên Firestore.
  - Đăng nhập Admin bằng tài khoản Google.
  - Bảo mật dữ liệu bằng Security Rules.
- **Giao diện:** Thiết kế hiện đại, tối giản (Brutalist Style) sử dụng Tailwind CSS.

## 🛠 Công nghệ sử dụng
- **Frontend:** React 18, TypeScript, Vite.
- **Styling:** Tailwind CSS, Lucide Icons.
- **Charts:** Recharts.
- **Database & Auth:** Firebase (Firestore, Auth).
- **Excel Processing:** XLSX (SheetJS).

## 📦 Hướng dẫn cài đặt (Local)

1. **Tải mã nguồn:**
   ```bash
   git clone <your-github-url>
   cd <folder-name>
   ```

2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

3. **Chạy ứng dụng:**
   ```bash
   npm run dev
   ```
   Ứng dụng sẽ chạy tại: `http://localhost:3000`

## 🔐 Cấu hình Firebase
Ứng dụng yêu cầu một dự án Firebase để hoạt động. Các thông số cấu hình nằm trong file `firebase-applet-config.json`.
- Đảm bảo đã bật **Google Authentication** trong Firebase Console.
- Nạp quy tắc bảo mật từ file `firestore.rules` vào phần **Firestore -> Rules**.

## 📝 Giấy phép
Bản quyền thuộc về ldkien116@gmail.com.
