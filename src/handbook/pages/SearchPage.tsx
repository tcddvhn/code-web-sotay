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
    <div className="rounded-[16px] border border-[var(--line)] bg-white p-4 md:p-5">
      <div className="text-base font-bold text-[var(--primary-dark)]">Tìm kiếm thông tin</div>
      <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
        Ưu tiên gõ theo tên văn bản, câu hỏi, tag hoặc tên biểu mẫu để ra kết quả nhanh hơn.
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3">
        <Search size={18} className="text-[var(--primary-dark)]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Nhập tên văn bản, câu hỏi, tag hoặc biểu mẫu..."
          className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
        />
      </div>

      <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
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
              className="w-full rounded-[12px] border border-[var(--line)] px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]"
            >
              <div className="text-sm font-bold text-[var(--ink)]">{item.title}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                {(SECTION_LABELS[item.section] || item.section)}
                {item.tag ? ` • ${item.tag}` : ''}
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
