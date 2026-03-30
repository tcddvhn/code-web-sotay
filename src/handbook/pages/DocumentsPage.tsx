import React from 'react';
import { LegacyListSectionPage } from './LegacyListSectionPage';
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
    <LegacyListSectionPage
      section="tai-lieu"
      title="Danh mục Tài liệu"
      description="Tổng hợp các văn bản, hướng dẫn và tài liệu tham khảo để tra cứu nhanh."
      {...props}
    />
  );
}
