# Hệ thống Tổng Hợp Dữ Liệu Excel

Ứng dụng web dùng để tiếp nhận, chuẩn hóa và tổng hợp dữ liệu báo cáo từ các file Excel của đơn vị thành viên. Hệ thống sử dụng React, TypeScript và Firebase để quản lý dữ liệu tập trung, phân quyền người dùng và theo dõi tiến độ tiếp nhận.

## Tính năng chính

- Tiếp nhận dữ liệu từ nhiều file Excel theo biểu mẫu đã cấu hình.
- Học biểu mẫu bằng AI hoặc thiết lập thủ công.
- Quản lý dự án, biểu mẫu và dữ liệu theo từng năm.
- Phân công 8 tài khoản theo dõi đơn vị, tránh trùng đơn vị giữa các người được giao.
- Báo cáo tổng hợp theo dự án, năm và biểu mẫu.
- Lưu vết người cập nhật dữ liệu và lịch sử migration.

## Công nghệ sử dụng

- Frontend: React 19, TypeScript, Vite
- Styling: Tailwind CSS 4
- Chart: Recharts
- Database/Auth/Storage: Firebase
- Excel: SheetJS (`xlsx`)
- AI phân tích biểu mẫu: Google GenAI

## Cài đặt local

1. Cài dependencies:

```bash
npm install
```

2. Tạo file `.env` từ `.env.example` và điền:

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

Ứng dụng mặc định chạy tại `http://localhost:3000`.

## Firebase

- Ứng dụng hiện ưu tiên đọc cấu hình Firebase từ biến môi trường `.env`.
- Nếu `.env` chưa được điền đầy đủ, hệ thống sẽ fallback về cấu hình mặc định đang lưu trong `firebase-applet-config.json`.
- Cần bật Authentication cho các tài khoản được cấp quyền.
- Cần publish `firestore.rules` sau mỗi lần cập nhật rules.
- Hệ thống hiện chỉ cho phép các tài khoản đã khai báo trong mã nguồn đăng nhập.

## Ghi chú triển khai

- Dự án hiện được tối ưu để làm việc trực tiếp trên Firebase từ client.
- Chức năng AI yêu cầu `VITE_GEMINI_API_KEY` trước khi dùng.
- File `firebase-blueprint.json` được giữ lại để mô tả schema/tham chiếu cấu trúc Firebase.
- Khi deploy/publish, cần bảo đảm rules Firestore đã được cập nhật đồng bộ.
