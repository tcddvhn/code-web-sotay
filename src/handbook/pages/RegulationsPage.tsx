import React from 'react';
import { SectionPage } from './SectionPage';
import { HandbookNodeOutlineItem } from '../types';

export function RegulationsPage(props: {
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  isFavorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  return (
    <SectionPage
      eyebrow="Tra cứu nền tảng"
      title="Quy định"
      description="Khu tra cứu điều lệ, hướng dẫn và quy định nền tảng. Phù hợp khi cần tìm nhanh văn bản gốc, quy tắc thực hiện và các mốc nghiệp vụ quan trọng."
      helperText="Ưu tiên tìm theo tên văn bản, số hiệu, chủ đề hoặc từ khóa nghiệp vụ."
      {...props}
    />
  );
}
