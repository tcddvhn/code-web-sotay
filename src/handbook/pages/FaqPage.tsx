import React from 'react';
import { SectionPage } from './SectionPage';
import { HandbookNodeOutlineItem } from '../types';

export function FaqPage(props: {
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  isFavorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  return (
    <SectionPage
      eyebrow="Tra cứu nhanh"
      title="Hỏi đáp"
      description="Khu tổng hợp tình huống nghiệp vụ và câu hỏi thường gặp. Phù hợp cho tra cứu nhanh khi đang xử lý công việc thực tế hoặc cần trả lời ngắn gọn."
      helperText="Nên ưu tiên câu hỏi ngắn, tiêu đề rõ và bám đúng ngôn ngữ người dùng."
      {...props}
    />
  );
}
