import React, { useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, Download, ExternalLink, FileSearch, Filter } from 'lucide-react';
import { HandbookNodeOutlineItem } from '../types';

function DetailHtml({ html }: { html?: string | null }) {
  if (!html) {
    return <div className="text-sm leading-7 text-[var(--ink-soft)]">Chưa có nội dung chi tiết cho mục này.</div>;
  }

  return <div className="prose prose-sm max-w-none text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SectionPage({
  eyebrow,
  title,
  description,
  helperText,
  nodes,
  selectedNodeId,
  onSelectNode,
  isFavorite = false,
  canFavorite = false,
  onToggleFavorite,
}: {
  eyebrow: string;
  title: string;
  description: string;
  helperText?: string;
  nodes: HandbookNodeOutlineItem[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  isFavorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: (nodeId: string) => void;
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredNodes = useMemo(() => {
    const normalizedQuery = filterQuery.trim().toLocaleLowerCase('vi-VN');
    if (!normalizedQuery) {
      return nodes;
    }

    return nodes.filter((node) => {
      const titleMatch = node.title.toLocaleLowerCase('vi-VN').includes(normalizedQuery);
      const tagMatch = node.tag?.toLocaleLowerCase('vi-VN').includes(normalizedQuery);
      return titleMatch || Boolean(tagMatch);
    });
  }, [filterQuery, nodes]);

  const selectedNode = filteredNodes.find((node) => node.id === selectedNodeId)
    || nodes.find((node) => node.id === selectedNodeId)
    || filteredNodes[0]
    || nodes[0]
    || null;

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    nodes.forEach((node) => {
      const tag = node.tag?.trim();
      if (!tag) {
        return;
      }
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [nodes]);

  const getLevelAccent = (depth: number) => {
    switch (depth) {
      case 0:
        return 'border-l-[4px] border-l-[var(--primary)]';
      case 1:
        return 'border-l-[3px] border-l-[#1b5e20]';
      case 2:
        return 'border-l-[3px] border-l-[#34495e]';
      default:
        return 'border-l-[2px] border-l-[#d35400]';
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4 md:px-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">{eyebrow}</div>
        <h2 className="mt-2 font-['Times_New_Roman'] text-[1.65rem] font-extrabold text-[var(--primary-dark)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{description}</p>
        {helperText ? <div className="mt-2 text-sm font-semibold text-[var(--primary-dark)]">{helperText}</div> : null}

        {topTags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {topTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilterQuery(tag)}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--primary-dark)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-[14px] border border-[var(--line)] bg-white px-3 py-4 md:px-4">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-bold text-[var(--ink)]">Danh sách nội dung</div>
            <div className="mt-1 text-sm text-[var(--ink-soft)]">
              {filteredNodes.length === nodes.length ? `${nodes.length} mục đang xuất bản` : `${filteredNodes.length}/${nodes.length} mục khớp bộ lọc`}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 md:min-w-[320px]">
            <Filter size={16} className="text-[var(--primary-dark)]" />
            <input
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Lọc nhanh theo tên mục hoặc tag..."
              className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {filteredNodes.length > 0 ? (
            filteredNodes.map((node) => {
              const isActive = node.id === selectedNode?.id;
              return (
                <div
                  key={node.id}
                  className={`overflow-hidden rounded-[10px] border border-[var(--line)] bg-white ${getLevelAccent(node.depth)}`}
                  style={{ marginLeft: `${node.depth * 14}px` }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectNode(node.id)}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition ${
                      isActive ? 'bg-[var(--surface-soft)]' : 'hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold leading-6 text-[var(--ink)]">{node.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                        {node.tag ? <span>{node.tag}</span> : null}
                        {node.childrenCount > 0 ? <span>{node.childrenCount} mục con</span> : null}
                      </div>
                    </div>
                    <div className="pt-1 text-xs font-bold text-[var(--ink-soft)]">{isActive ? '−' : '+'}</div>
                  </button>

                  {isActive ? (
                    <div className="border-t border-[var(--line)] px-3 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
                          Cấp {node.level + 1}
                        </div>
                        {node.tag ? (
                          <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
                            Tag: {node.tag}
                          </div>
                        ) : null}
                        {node.childrenCount > 0 ? (
                          <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
                            {node.childrenCount} mục con
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!canFavorite || !onToggleFavorite}
                          onClick={() => onToggleFavorite?.(node.id)}
                          className="secondary-btn inline-flex items-center gap-2 !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isFavorite ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                          {isFavorite ? 'Đã lưu yêu thích' : canFavorite ? 'Lưu yêu thích' : 'Đăng nhập để lưu'}
                        </button>
                        {node.fileUrl ? (
                          <a
                            href={node.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="secondary-btn inline-flex items-center gap-2 !px-3 !py-2 text-xs"
                          >
                            <Download size={14} />
                            {node.fileName || 'Mở tệp'}
                          </a>
                        ) : null}
                      </div>

                      {node.summaryHtml ? (
                        <div className="mt-4 border-l-[3px] border-l-[var(--primary)] pl-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Tóm tắt</div>
                          <div className="mt-2 prose prose-sm max-w-none text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: node.summaryHtml }} />
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Nội dung chi tiết</div>
                        <div className="mt-2 text-[15px] leading-7 text-[var(--ink)]">
                          <DetailHtml html={node.detailHtml} />
                        </div>
                      </div>

                      {node.pdfRefs.length > 0 ? (
                        <div className="mt-4 border-t border-[var(--line)] pt-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Tham chiếu PDF</div>
                          <div className="mt-2 space-y-2">
                            {node.pdfRefs.map((ref) => (
                              <div key={`${ref.doc}-${ref.page}`} className="flex items-center justify-between gap-3 text-sm text-[var(--ink-soft)]">
                                <span>{ref.doc}</span>
                                <span>Trang {ref.page}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
              {nodes.length > 0
                ? 'Không có mục nào khớp từ khóa lọc hiện tại.'
                : 'Chưa có dữ liệu nào trong section này. Bạn có thể import dữ liệu handbook vào Supabase rồi tải lại trang để xem.'}
            </div>
          )}
        </div>

        {!selectedNode && (
          <div className="mt-6 flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-6 text-center">
            <FileSearch size={28} className="text-[var(--primary-dark)]" />
            <div className="text-lg font-extrabold text-[var(--primary-dark)]">Chưa có nội dung để hiển thị</div>
            <div className="max-w-xl text-sm leading-7 text-[var(--ink-soft)]">
              Khi dữ liệu handbook đã được import sang Supabase, danh sách nội dung sẽ xuất hiện đầy đủ tại đây.
            </div>
            <a
              href="https://supabase.com/dashboard/project/taivkgwwinakcoxhquyv/editor"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-dark)] hover:underline"
            >
              Kiểm tra dữ liệu trong Supabase
              <ExternalLink size={15} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
