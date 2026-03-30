import React from 'react';
import { Search } from 'lucide-react';
import { HandbookNodeOutlineItem } from '../types';

const SECTION_LABELS: Record<string, string> = {
  'quy-dinh': 'Quy định',
  'hoi-dap': 'Hỏi đáp',
  'bieu-mau': 'Biểu mẫu',
  'tai-lieu': 'Tài liệu',
};

export function SearchPage({
  query,
  onQueryChange,
  results,
  onSelectResult,
  isLoading,
  error,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: HandbookNodeOutlineItem[];
  onSelectResult: (item: HandbookNodeOutlineItem) => void;
  isLoading: boolean;
  error?: string | null;
}) {
  return (
    <div className="panel-card rounded-[28px] border p-5 md:p-6">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Tra cứu toàn bộ Sổ tay</div>
      <div className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">
        Ưu tiên gõ theo tên văn bản, câu hỏi, tag hoặc tên biểu mẫu để ra kết quả nhanh hơn.
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3">
        <Search size={18} className="text-[var(--primary-dark)]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Nhập tên văn bản, câu hỏi, tag hoặc biểu mẫu..."
          className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
        />
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-sm text-[var(--ink-soft)]">Đang tìm kiếm dữ liệu handbook...</div>
        ) : error ? (
          <div className="text-sm text-[var(--primary-dark)]">{error}</div>
        ) : results.length > 0 ? (
          results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectResult(item)}
              className="w-full rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
            >
              <div className="text-sm font-bold text-[var(--ink)]">{item.title}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                {(SECTION_LABELS[item.section] || item.section)} {item.tag ? `• ${item.tag}` : ''}
              </div>
            </button>
          ))
        ) : query.trim() ? (
          <div className="text-sm text-[var(--ink-soft)]">Không tìm thấy kết quả phù hợp.</div>
        ) : (
          <div className="text-sm text-[var(--ink-soft)]">Nhập từ khóa để bắt đầu tìm kiếm trong dữ liệu handbook.</div>
        )}
      </div>
    </div>
  );
}
