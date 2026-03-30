import React from 'react';
import { SectionPage } from './SectionPage';
import { HandbookNodeOutlineItem } from '../types';

export function FormsPage(props: {
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  isFavorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  return (
    <SectionPage
      eyebrow="Section handbook_nodes"
      title="Biểu mẫu"
      description="Kho biểu mẫu và tệp tải về của Sổ tay. Phần này dành cho tài liệu dùng chung, tách biệt với luồng học biểu mẫu và báo cáo của Hệ thống dữ liệu."
      {...props}
    />
  );
}
