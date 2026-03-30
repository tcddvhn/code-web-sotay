import React from 'react';
import { LegacyListSectionPage } from './LegacyListSectionPage';
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
    <LegacyListSectionPage
      section="bieu-mau"
      title="Hệ thống Biểu mẫu"
      description="Toàn bộ biểu mẫu đính kèm được phân loại tự động để tải xuống nhanh chóng."
      {...props}
    />
  );
}
