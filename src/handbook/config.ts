import { FileText, Files, HelpCircle, Home, LibraryBig, type LucideIcon } from 'lucide-react';
import { HandbookNavItem, HandbookNoticePreview, HandbookQuickLink } from './types';

export const HANDBOOK_NAV_ITEMS: Array<HandbookNavItem & { icon: LucideIcon }> = [
  {
    id: 'home',
    label: 'Trang chủ',
    shortLabel: 'Trang chủ',
    description: 'Lối vào nhanh để tra cứu, xem cập nhật và mở hệ thống dữ liệu.',
    icon: Home,
  },
  {
    id: 'quy-dinh',
    label: 'Quy định',
    shortLabel: 'Quy định',
    description: 'Điều lệ, hướng dẫn và quy định nền tảng cần tra cứu thường xuyên.',
    icon: LibraryBig,
  },
  {
    id: 'hoi-dap',
    label: 'Hỏi đáp',
    shortLabel: 'Hỏi đáp',
    description: 'Câu hỏi ngắn, tình huống thực tế và cách xử lý nhanh.',
    icon: HelpCircle,
  },
  {
    id: 'bieu-mau',
    label: 'Biểu mẫu',
    shortLabel: 'Biểu mẫu',
    description: 'Biểu mẫu tải về, file dùng chung và hướng dẫn thao tác nhanh.',
    icon: Files,
  },
  {
    id: 'tai-lieu',
    label: 'Tài liệu',
    shortLabel: 'Tài liệu',
    description: 'Tài liệu tham khảo, văn bản gốc và các PDF nền.',
    icon: FileText,
  },
];

export const HANDBOOK_QUICK_LINKS: HandbookQuickLink[] = [
  {
    title: 'Tra cứu điều lệ và quy định',
    description: 'Mở nhanh các quy định cốt lõi, hướng dẫn nền tảng và mốc nghiệp vụ quan trọng.',
    section: 'quy-dinh',
  },
  {
    title: 'Mở nhanh kho Hỏi đáp',
    description: 'Tra câu trả lời ngắn cho các tình huống thường gặp và lỗi phát sinh trong thực tế.',
    section: 'hoi-dap',
  },
  {
    title: 'Tải biểu mẫu dùng chung',
    description: 'Tìm đúng biểu mẫu, file đính kèm và đường dẫn tải về theo nhu cầu thực tế.',
    section: 'bieu-mau',
  },
  {
    title: 'Mở thư viện tài liệu',
    description: 'Xem tài liệu gốc, văn bản tham khảo và các PDF nền theo chủ đề.',
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
