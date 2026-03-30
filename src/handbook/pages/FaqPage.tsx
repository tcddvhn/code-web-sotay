import React from 'react';
import { LegacyListSectionPage } from './LegacyListSectionPage';
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
    <LegacyListSectionPage
      section="hoi-dap"
      title="Tổng hợp Hỏi đáp"
      description="Hệ thống tự động tổng hợp các tình huống, câu hỏi nghiệp vụ thường gặp."
      {...props}
    />
  );
}
