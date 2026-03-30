import React from 'react';
import { Search } from 'lucide-react';
import { HandbookNodeOutlineItem } from '../types';

export function SearchPage({
  query,
  onQueryChange,
  results,
  onSelectResult,
  isLoading,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: HandbookNodeOutlineItem[];
  onSelectResult: (item: HandbookNodeOutlineItem) => void;
  isLoading: boolean;
}) {
  return (
    <div className="panel-card rounded-[28px] border p-5 md:p-6">
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Tra cứu toàn bộ Sổ tay</div>
      <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3">
        <Search size={18} className="text-[var(--primary-dark)]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Nhập tiêu đề, tag hoặc đoạn nội dung cần tìm..."
          className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
        />
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="text-sm text-[var(--ink-soft)]">Đang tìm kiếm dữ liệu handbook...</div>
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
                {item.section} {item.tag ? `• ${item.tag}` : ''}
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
