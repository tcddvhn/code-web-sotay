import React, { useEffect, useState } from 'react';
import { Clock3, Search } from 'lucide-react';
import { HandbookNodeOutlineItem } from '../types';

const SECTION_LABELS: Record<string, string> = {
  'quy-dinh': 'Quy định',
  'hoi-dap': 'Hỏi đáp',
  'bieu-mau': 'Biểu mẫu',
  'tai-lieu': 'Tài liệu',
};

const HISTORY_KEY = 'handbook_search_history';

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
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(stored)) {
        setRecentQueries(stored.slice(0, 5));
      }
    } catch (storageError) {
      console.warn('Không thể đọc lịch sử tìm kiếm handbook:', storageError);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRecentQueries((current) => {
        const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 5);
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="legacy-panel">
      <div className="border-b border-[var(--legacy-border)] px-4 py-4 font-['-apple-system'] text-base font-bold text-[var(--legacy-text-main)]">
        Tìm kiếm thông tin
      </div>
      <div className="legacy-search-container">
        <div className="legacy-search-input-wrapper">
          <select defaultValue="">
            <option value="">Tất cả danh mục</option>
            <option value="hỏi đáp">Hỏi đáp</option>
            <option value="quy trình">Quy trình</option>
            <option value="biểu mẫu">Biểu mẫu</option>
            <option value="quy định">Quy định</option>
            <option value="tài liệu">Tài liệu</option>
          </select>
          <div className="legacy-search-input-core">
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Nhập từ khóa cần tìm..."
              autoFocus
            />
            <button type="button">
              <Search size={16} />
            </button>
          </div>
        </div>

        {recentQueries.length > 0 ? (
          <div className="legacy-search-history-area">
            <div className="legacy-search-history-title">
              <span className="inline-flex items-center gap-1">
                <Clock3 size={14} />
                5 tìm kiếm gần đây:
              </span>
            </div>
            <div className="legacy-chip-row">
              {recentQueries.map((item) => (
                <button key={item} type="button" className="legacy-chip" onClick={() => onQueryChange(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mb-4 border-b border-[var(--legacy-border-light)] pb-4">
          <p className="mb-2 flex items-center gap-1 text-[0.95rem] font-bold text-[var(--legacy-text-muted)]">
            <Search size={16} color="#f39c12" /> Gợi ý nhanh:
          </p>
          <div className="legacy-chip-row">
            {['dự bị biểu quyết', 'mất thẻ đảng', 'chuyển sinh hoạt', 'biểu mẫu'].map((item) => (
              <button key={item} type="button" className="legacy-chip" onClick={() => onQueryChange(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="legacy-search-results">
          {isLoading ? (
            <div className="p-4 text-sm text-[var(--legacy-text-muted)]">Đang tìm kiếm dữ liệu handbook...</div>
          ) : error ? (
            <div className="p-4 text-sm text-[var(--legacy-primary-dark)]">{error}</div>
          ) : results.length > 0 ? (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectResult(item)}
                className="legacy-search-result"
              >
                <div className="font-['-apple-system'] text-[1.02rem] font-bold text-[#2980b9]">{item.title}</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--legacy-text-muted)]">
                  {SECTION_LABELS[item.section] || item.section}
                  {item.tag ? ` • ${item.tag}` : ''}
                </div>
              </button>
            ))
          ) : query.trim() ? (
            <div className="p-4 text-sm text-[var(--legacy-text-muted)]">Không tìm thấy kết quả phù hợp.</div>
          ) : (
            <div className="p-4 text-sm text-[var(--legacy-text-muted)]">Gõ từ khóa để tìm kiếm...</div>
          )}
        </div>
      </div>
    </div>
  );
}
