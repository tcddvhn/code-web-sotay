import { FileText, Files, HelpCircle, Home, LibraryBig, type LucideIcon } from 'lucide-react';
import { HandbookNavItem, HandbookNoticePreview, HandbookQuickLink } from './types';

export const HANDBOOK_NAV_ITEMS: Array<HandbookNavItem & { icon: LucideIcon }> = [
  {
    id: 'home',
    label: 'Trang chủ',
    shortLabel: 'Trang chủ',
    description: 'Trang điều hướng chung của Sổ tay nghiệp vụ.',
    icon: Home,
  },
  {
    id: 'quy-dinh',
    label: 'Quy định',
    shortLabel: 'Quy định',
    description: 'Tra cứu hệ thống quy định và hướng dẫn nền tảng.',
    icon: LibraryBig,
  },
  {
    id: 'hoi-dap',
    label: 'Hỏi đáp',
    shortLabel: 'Hỏi đáp',
    description: 'Tổng hợp các tình huống và câu hỏi nghiệp vụ thường gặp.',
    icon: HelpCircle,
  },
  {
    id: 'bieu-mau',
    label: 'Biểu mẫu',
    shortLabel: 'Biểu mẫu',
    description: 'Danh mục biểu mẫu tải về và tài liệu thao tác nhanh.',
    icon: Files,
  },
  {
    id: 'tai-lieu',
    label: 'Tài liệu',
    shortLabel: 'Tài liệu',
    description: 'Kho tài liệu tham khảo, văn bản và PDF gốc.',
    icon: FileText,
  },
];

export const HANDBOOK_QUICK_LINKS: HandbookQuickLink[] = [
  {
    title: 'Tra cứu quy định theo chuyên đề',
    description: 'Dùng cho điều lệ, hướng dẫn, quy định và các mốc nghiệp vụ quan trọng.',
    section: 'quy-dinh',
  },
  {
    title: 'Mở nhanh kho Hỏi đáp',
    description: 'Dành cho tình huống xử lý thực tế, tra câu trả lời ngắn và nhanh.',
    section: 'hoi-dap',
  },
  {
    title: 'Tải biểu mẫu dùng chung',
    description: 'Tổng hợp các biểu mẫu, file đính kèm và đường dẫn tải về.',
    section: 'bieu-mau',
  },
  {
    title: 'Mở thư viện tài liệu',
    description: 'Xem tài liệu gốc, văn bản tham khảo và các bản PDF nền.',
    section: 'tai-lieu',
  },
];

export const HANDBOOK_NOTICE_PREVIEWS: HandbookNoticePreview[] = [
  {
    id: 'notice-1',
    title: 'Cập nhật mô hình Sổ tay trên nền mới',
    summary: 'Toàn bộ module Sổ tay sẽ được xây mới trên nền code-web-sotay mà không làm gián đoạn site cũ.',
    publishedAt: '2026-03-29',
  },
  {
    id: 'notice-2',
    title: 'Giữ nguyên 5 tab mobile của Sổ tay',
    summary: 'Mobile sẽ tiếp tục dùng 5 tab quen thuộc; Hệ thống dữ liệu được đưa vào menu phụ.',
    publishedAt: '2026-03-29',
  },
];
