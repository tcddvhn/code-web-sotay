import React, { useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, Download, ExternalLink, FileSearch, Filter, FolderKanban } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      <div className="panel-card rounded-[30px] p-6 md:p-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--primary)]">{eyebrow}</div>
        <h2 className="mt-3 text-[2rem] font-extrabold tracking-[-0.04em] text-[var(--primary-dark)]">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">{description}</p>
        {helperText ? <div className="mt-3 text-sm font-semibold text-[var(--primary-dark)]">{helperText}</div> : null}

        {topTags.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
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

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="panel-card rounded-[28px] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 px-2 pb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Danh sách nội dung</div>
              <div className="mt-1 text-sm text-[var(--ink-soft)]">
                {filteredNodes.length === nodes.length ? `${nodes.length} mục đang xuất bản` : `${filteredNodes.length}/${nodes.length} mục khớp bộ lọc`}
              </div>
            </div>
            <FolderKanban size={18} className="text-[var(--primary-dark)]" />
          </div>

          <div className="px-2 pb-3">
            <div className="flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3">
              <Filter size={16} className="text-[var(--primary-dark)]" />
              <input
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="Lọc nhanh theo tên mục hoặc tag..."
                className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
              />
            </div>
          </div>

          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {filteredNodes.length > 0 ? (
              filteredNodes.map((node) => {
                const isActive = node.id === selectedNode?.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectNode(node.id)}
                    className={`w-full rounded-[22px] border px-4 py-3 text-left transition-transform hover:-translate-y-0.5 ${
                      isActive
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                        : 'border-[var(--line)] bg-[var(--surface-soft)]'
                    }`}
                    style={{ paddingLeft: `${16 + node.depth * 18}px` }}
                  >
                    <div className="text-sm font-bold text-[var(--ink)]">{node.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
                      {node.tag ? <span>{node.tag}</span> : null}
                      {node.childrenCount > 0 ? <span>{node.childrenCount} mục con</span> : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
                {nodes.length > 0
                  ? 'Không có mục nào khớp từ khóa lọc hiện tại.'
                  : 'Chưa có dữ liệu nào trong section này. Bạn có thể import dữ liệu handbook vào Supabase rồi tải lại trang để xem.'}
              </div>
            )}
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-7">
          {selectedNode ? (
            <div className="space-y-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Nội dung đang xem</div>
                <h3 className="mt-2 text-[1.8rem] font-extrabold tracking-[-0.04em] text-[var(--primary-dark)]">{selectedNode.title}</h3>
                {selectedNode.tag ? <div className="mt-2 text-sm font-semibold text-[var(--ink-soft)]">Tag: {selectedNode.tag}</div> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)]">
                  Cấp nội dung: {selectedNode.level + 1}
                </div>
                {selectedNode.childrenCount > 0 ? (
                  <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)]">
                    {selectedNode.childrenCount} mục con
                  </div>
                ) : null}
                {selectedNode.fileUrl ? (
                  <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)]">
                    Có file đính kèm
                  </div>
                ) : null}
                {selectedNode.pdfRefs.length > 0 ? (
                  <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)]">
                    {selectedNode.pdfRefs.length} tham chiếu PDF
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canFavorite || !onToggleFavorite}
                  onClick={() => selectedNode && onToggleFavorite?.(selectedNode.id)}
                  className="secondary-btn inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFavorite ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  {isFavorite ? 'Đã lưu yêu thích' : canFavorite ? 'Lưu vào yêu thích' : 'Đăng nhập để lưu'}
                </button>
              </div>

              {selectedNode.summaryHtml ? (
                <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Tóm tắt</div>
                  <div className="mt-3 prose prose-sm max-w-none text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: selectedNode.summaryHtml }} />
                </div>
              ) : null}

              <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-5">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Nội dung chi tiết</div>
                <div className="mt-4">
                  <DetailHtml html={selectedNode.detailHtml} />
                </div>
              </div>

              {(selectedNode.fileUrl || selectedNode.pdfRefs.length > 0) && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Tệp đính kèm</div>
                    {selectedNode.fileUrl ? (
                      <a
                        href={selectedNode.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-dark)] hover:underline"
                      >
                        <Download size={15} />
                        {selectedNode.fileName || 'Mở tệp đính kèm'}
                      </a>
                    ) : (
                      <div className="mt-3 text-sm text-[var(--ink-soft)]">Mục này chưa gắn file tải về.</div>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">PDF refs</div>
                    {selectedNode.pdfRefs.length > 0 ? (
                      <div className="mt-3 space-y-2 text-sm text-[var(--ink-soft)]">
                        {selectedNode.pdfRefs.map((ref) => (
                          <div key={`${ref.doc}-${ref.page}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                            <span>{ref.doc}</span>
                            <span>Trang {ref.page}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-[var(--ink-soft)]">Chưa có tham chiếu PDF cho mục này.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              <FileSearch size={28} className="text-[var(--primary-dark)]" />
              <div className="text-lg font-extrabold text-[var(--primary-dark)]">Chưa có nội dung để hiển thị</div>
              <div className="max-w-xl text-sm leading-7 text-[var(--ink-soft)]">
                Khi dữ liệu handbook đã được import sang Supabase, danh sách nội dung sẽ xuất hiện ở cột bên trái và phần chi tiết sẽ hiển thị tại đây.
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
    </div>
  );
}
