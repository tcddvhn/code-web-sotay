# UI Quality Checklist

## Mục tiêu

Checklist này dùng để giữ giao diện của hệ thống ổn định hơn theo ba nhóm:

- trải nghiệm người dùng
- accessibility
- hiệu năng hiển thị

## Đã hoàn thành

- `lang="vi"` đã được đặt trong [index.html](/Users/tranhau/Documents/GitHub/code-web-sotay/index.html)
- đã có `skip link` để bỏ qua menu trái và vào thẳng nội dung chính
- đã có `focus-visible` rõ cho button, link, input, select, textarea và phần tử `role="button"`
- đã có `prefers-reduced-motion` để giảm animation khi người dùng bật chế độ hạn chế chuyển động
- các icon button quan trọng đã có `aria-label`
- loading state trên dashboard đã có `role="status"` và `aria-busy`
- các màn nặng đã chuyển sang `React.lazy` + `Suspense`
- banner dashboard đã chuyển sang bản `.jpg` nhẹ hơn

## Nên duy trì

- mọi text tiếng Việt phải giữ UTF-8 chuẩn
- không đổi font stack hiện tại nếu chưa có lý do rõ ràng
- nút icon không được chỉ dựa vào `title`, nên có `aria-label`
- các vùng loading phải có thông báo đọc được, không chỉ spinner
- các màn mới nếu nặng nên ưu tiên lazy-load

## Khi thêm giao diện mới

- ưu tiên text phụ từ `12px` trở lên nếu là nội dung cần đọc thường xuyên
- text nhỏ hơn `12px` chỉ dùng cho mã, nhãn phụ, meta hoặc badge
- luôn kiểm tra trạng thái:
  - bình thường
  - hover
  - focus
  - disabled
  - loading
  - lỗi
- nếu có ảnh lớn ở đầu trang, phải cân nhắc dung lượng trước khi đưa vào repo

## Các điểm nên rà tiếp khi có thời gian

- kiểm tra contrast bằng Lighthouse hoặc Axe trên:
  - text phụ
  - badge vàng
  - badge xanh
- cân nhắc thêm skeleton/loading chuẩn cho các màn khác ngoài dashboard
- cân nhắc tách tiếp bundle cho các khối ít dùng trong `Cài đặt`

## Ghi chú banner

- app hiện đang dùng:
  - [dashboard-banner-desktop.jpg](/Users/tranhau/Documents/GitHub/code-web-sotay/src/assets/dashboard-banner-desktop.jpg)
  - [dashboard-banner-mobile.jpg](/Users/tranhau/Documents/GitHub/code-web-sotay/src/assets/dashboard-banner-mobile.jpg)
- nếu thay banner mới, nên giữ dung lượng ở mức thấp nhất có thể để tránh ảnh hưởng LCP
