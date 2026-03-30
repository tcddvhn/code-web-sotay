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
      eyebrow="Tải về và thao tác"
      title="Biểu mẫu"
      description="Kho biểu mẫu và tệp tải về của Sổ tay. Phần này dành cho tài liệu dùng chung, tách biệt với luồng học biểu mẫu và báo cáo của Hệ thống dữ liệu."
      helperText="Ưu tiên đặt tên biểu mẫu sát cách gọi thực tế để người dùng tìm nhanh hơn."
      {...props}
    />
  );
}
