import React from 'react';
import { SectionPage } from './SectionPage';
import { HandbookNodeOutlineItem } from '../types';

export function DocumentsPage(props: {
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  isFavorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  return (
    <SectionPage
      eyebrow="Đối chiếu và tham khảo"
      title="Tài liệu"
      description="Kho tài liệu tham khảo, văn bản nền và các tham chiếu PDF. Đây là khu dành cho người dùng đọc, tải và đối chiếu tài liệu gốc."
      helperText="Phù hợp cho tài liệu dài, văn bản gốc và các PDF cần đối chiếu nhiều lần."
      {...props}
    />
  );
}
