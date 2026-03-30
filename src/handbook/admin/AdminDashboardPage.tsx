import React from 'react';
import { FileText, Megaphone, Rows3 } from 'lucide-react';
import { HandbookNoticeItem, HandbookSectionSummary } from '../types';

const SECTION_LABELS: Record<string, string> = {
  'quy-dinh': 'Quy định',
  'hoi-dap': 'Hỏi đáp',
  'bieu-mau': 'Biểu mẫu',
  'tai-lieu': 'Tài liệu',
};

export function AdminDashboardPage({
  summaries,
  notices,
  onOpenNodes,
  onOpenNotices,
}: {
  summaries: HandbookSectionSummary[];
  notices: HandbookNoticeItem[];
  onOpenNodes: () => void;
  onOpenNotices: () => void;
}) {
  const totalNodes = summaries.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-5">
      <div className="panel-card rounded-[28px] p-6 md:p-7">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Admin handbook</div>
        <h2 className="mt-2 text-[1.8rem] font-extrabold tracking-[-0.04em] text-[var(--primary-dark)]">Bảng điều phối nội dung Sổ tay mới</h2>
        <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
          Đây là khu quản trị riêng cho module handbook mới. Nó chỉ thao tác với các bảng <code>handbook_*</code> trên Supabase và không can thiệp vào 2 hệ thống đang chạy.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel-card rounded-[24px] p-5">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
            <Rows3 size={18} />
          </div>
          <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Tổng node</div>
          <div className="mt-2 text-4xl font-extrabold tracking-[-0.05em] text-[var(--primary-dark)]">{totalNodes}</div>
        </div>
        <div className="panel-card rounded-[24px] p-5">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
            <Megaphone size={18} />
          </div>
          <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Thông báo</div>
          <div className="mt-2 text-4xl font-extrabold tracking-[-0.05em] text-[var(--primary-dark)]">{notices.length}</div>
        </div>
        <div className="panel-card rounded-[24px] p-5">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
            <FileText size={18} />
          </div>
          <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Section đang có</div>
          <div className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{summaries.filter((item) => item.count > 0).map((item) => SECTION_LABELS[item.section]).join(', ') || 'Chưa có dữ liệu'}</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Section summary</div>
              <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Phân bố nội dung theo từng section</div>
            </div>
            <button type="button" onClick={onOpenNodes} className="secondary-btn">Quản lý node</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {summaries.map((item) => (
              <div key={item.section} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">{SECTION_LABELS[item.section]}</div>
                <div className="mt-2 text-3xl font-extrabold text-[var(--primary-dark)]">{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Thông báo</div>
              <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Gần đây</div>
            </div>
            <button type="button" onClick={onOpenNotices} className="secondary-btn">Quản lý thông báo</button>
          </div>
          <div className="mt-4 space-y-3">
            {notices.length > 0 ? notices.slice(0, 4).map((notice) => (
              <div key={notice.id} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                <div className="text-sm font-bold text-[var(--ink)]">{notice.title}</div>
                <div className="mt-2 line-clamp-3 text-sm leading-7 text-[var(--ink-soft)]">{notice.content}</div>
              </div>
            )) : (
              <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
                Chưa có thông báo nào trong handbook_notices.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
