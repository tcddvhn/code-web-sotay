# HỆ THỐNG QUẢN TRỊ DỮ LIỆU TCĐ, ĐV TẬP TRUNG

Ứng dụng web dùng để tiếp nhận, chuẩn hóa, tổng hợp và theo dõi dữ liệu báo cáo từ các file Excel của đơn vị. Hệ thống được xây dựng bằng React, TypeScript và Firebase, phù hợp cho mô hình quản trị dữ liệu tập trung theo dự án, biểu mẫu và năm báo cáo.

## Tính năng chính

- Tiếp nhận dữ liệu từ nhiều file Excel theo biểu mẫu đã phát hành.
- Học biểu mẫu bằng AI hoặc thiết lập thủ công.
- Quản lý dự án, biểu mẫu, năm báo cáo và dữ liệu tiếp nhận.
- Phân quyền tài khoản quản trị và tài khoản tiếp nhận dữ liệu.
- Phân công người theo dõi đơn vị theo từng dự án.
- Tổng hợp báo cáo và xuất file Excel theo cấu trúc mẫu.
- Lưu lịch sử xuất báo cáo để theo dõi và xóa khi cần.
- Quản lý danh mục đơn vị toàn hệ thống, hỗ trợ xóa mềm và khôi phục.

## Công nghệ sử dụng

- Frontend: React 19, TypeScript, Vite
- Giao diện: Tailwind CSS 4
- Biểu đồ: Recharts
- Cơ sở dữ liệu, xác thực, lưu file: Firebase
- Xử lý Excel: SheetJS (`xlsx`)
- AI phân tích biểu mẫu: Google Gemini

## Cài đặt local

1. Cài dependencies:

```bash
npm install
```

2. Tạo file `.env` từ `.env.example` và khai báo:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_FIRESTORE_DATABASE_ID=your_firestore_database_id
```

3. Chạy ứng dụng:

```bash
npm run dev
```

Mặc định ứng dụng chạy tại `http://localhost:3000`.

## Ghi chú Firebase

- Ứng dụng ưu tiên đọc cấu hình Firebase từ biến môi trường trong `.env`.
- Nếu `.env` chưa đầy đủ, hệ thống sẽ fallback về cấu hình mặc định đang lưu trong file cấu hình dự án.
- Cần bật Firebase Authentication cho các tài khoản được cấp quyền.
- Cần publish lại `firestore.rules` sau mỗi lần thay đổi rules.
- Nếu dùng lưu file báo cáo đã xuất, cần cấu hình Firebase Storage rules cho thư mục `report_exports`.
- Hệ thống chỉ cho phép các tài khoản đã khai báo trong danh sách allowlist đăng nhập.

## Ghi chú triển khai

- Dự án đang làm việc trực tiếp với Firebase từ phía client.
- Chức năng AI yêu cầu `VITE_GEMINI_API_KEY` trước khi sử dụng.
- Khi deploy lên Vercel, cần bảo đảm biến môi trường Firebase và Gemini đã được khai báo đầy đủ.
- Nếu thay đổi rules hoặc cấu trúc dữ liệu, nên kiểm tra lại Firestore, Authentication và Storage trước khi đưa vào production.
