import React from 'react';
import { SectionPage } from './SectionPage';
import { HandbookNodeOutlineItem } from '../types';

export function RegulationsPage(props: { nodes: HandbookNodeOutlineItem[]; selectedNodeId?: string | null; onSelectNode: (nodeId: string) => void }) {
  return (
    <SectionPage
      eyebrow="Section handbook_nodes"
      title="Quy định"
      description="Khu tra cứu quy định, điều lệ và hướng dẫn nền tảng. Dữ liệu được đọc trực tiếp từ bảng handbook_nodes trên Supabase."
      {...props}
    />
  );
}
