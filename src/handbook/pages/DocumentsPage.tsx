import React from 'react';
import { SectionPage } from './SectionPage';
import { HandbookNodeOutlineItem } from '../types';

export function DocumentsPage(props: { nodes: HandbookNodeOutlineItem[]; selectedNodeId?: string | null; onSelectNode: (nodeId: string) => void }) {
  return (
    <SectionPage
      eyebrow="Section handbook_nodes"
      title="Tài liệu"
      description="Kho tài liệu tham khảo, văn bản nền và các tham chiếu PDF. Đây là khu dành cho người dùng đọc, tải và đối chiếu tài liệu gốc."
      {...props}
    />
  );
}
