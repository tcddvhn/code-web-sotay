import React, { useState } from 'react';
import { BellRing, Bookmark, Clock3, Database, ExternalLink, FolderOpen, MessageSquareQuote, Search } from 'lucide-react';
import { HANDBOOK_QUICK_LINKS } from '../config';
import { HandbookActivityCardItem, HandbookNoticeItem, HandbookSectionSummary } from '../types';

const SECTION_LABELS: Record<string, string> = {
  'quy-dinh': 'Quy định',
  'hoi-dap': 'Hỏi đáp',
  'bieu-mau': 'Biểu mẫu',
  'tai-lieu': 'Tài liệu',
};

export function HomePage({
  summaries,
  notices,
  favorites,
  recentViews,
  currentUserName,
  feedbackEnabled,
  feedbackSubmitting,
  feedbackMessage,
  feedbackError,
  onSubmitFeedback,
  onSelectSection,
  onOpenNode,
  onOpenSearch,
  onOpenDataSystem,
}: {
  summaries: HandbookSectionSummary[];
  notices: HandbookNoticeItem[];
  favorites: HandbookActivityCardItem[];
  recentViews: HandbookActivityCardItem[];
  currentUserName?: string | null;
  feedbackEnabled?: boolean;
  feedbackSubmitting?: boolean;
  feedbackMessage?: string | null;
  feedbackError?: string | null;
  onSubmitFeedback?: (payload: { content: string; rating?: string | null }) => Promise<boolean>;
  onSelectSection: (section: 'quy-dinh' | 'hoi-dap' | 'bieu-mau' | 'tai-lieu') => void;
  onOpenNode: (nodeId: string, section: 'quy-dinh' | 'hoi-dap' | 'bieu-mau' | 'tai-lieu') => void;
  onOpenSearch?: () => void;
  onOpenDataSystem?: () => void;
}) {
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackRating, setFeedbackRating] = useState('hữu ích');

  const handleSubmitFeedback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onSubmitFeedback || !feedbackContent.trim()) {
      return;
    }

    const didSubmit = await onSubmitFeedback({
      content: feedbackContent.trim(),
      rating: feedbackRating,
    });
    if (didSubmit) {
      setFeedbackContent('');
    }
  };

  return (
    <div className="space-y-5">
      <section
        className="rounded-[16px] px-4 py-5 text-white shadow-[0_18px_34px_rgba(125,7,9,0.2)] md:px-6 md:py-6"
        style={{
          background: 'linear-gradient(135deg, rgba(179,15,20,0.96), rgba(141,17,19,0.92))',
        }}
      >
        <h2 className="font-['Times_New_Roman'] text-[1.45rem] font-extrabold md:text-[1.75rem]">
          Bạn cần tôi giúp gì hôm nay?
        </h2>
        <p className="mt-1 text-sm leading-6 text-white/85">
          Tra cứu nhanh quy định, câu hỏi, biểu mẫu và tài liệu theo đúng ngôn ngữ người dùng.
        </p>
        <button
          type="button"
          onClick={onOpenSearch}
          className="mt-4 flex w-full items-center gap-3 rounded-[12px] bg-white px-3 py-2 text-left text-[var(--ink)]"
        >
          <Search size={18} className="text-[var(--primary-dark)]" />
          <div className="min-w-0">
            <div className="text-sm font-bold">Nhập từ khóa để tìm trong toàn bộ Sổ tay</div>
            <div className="text-xs text-[var(--ink-soft)]">Ví dụ: mất thẻ đảng, miễn sinh hoạt, kết nạp, chuyển sinh hoạt...</div>
          </div>
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Mất thẻ đảng', 'Chuyển sinh hoạt', 'Mẫu báo cáo', 'Tài liệu gốc'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={onOpenSearch}
              className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {(recentViews.length > 0 || favorites.length > 0) && (
            <div className="space-y-4">
              {recentViews.length > 0 && (
                <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
                    <Clock3 size={16} className="text-[var(--primary-dark)]" />
                    Vừa xem gần đây
                  </div>
                  <div className="mt-3 space-y-2">
                    {recentViews.slice(0, 4).map((item) => (
                      <button
                        key={`recent-${item.id}`}
                        type="button"
                        onClick={() => onOpenNode(item.id, item.section)}
                        className="flex w-full items-start justify-between gap-3 rounded-[10px] border border-[var(--line)] px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]"
                      >
                        <div>
                          <div className="text-sm font-bold text-[var(--ink)]">{item.title}</div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                            {SECTION_LABELS[item.section]}
                            {item.tag ? ` • ${item.tag}` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {favorites.length > 0 && (
                <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
                    <Bookmark size={16} className="text-[var(--primary-dark)]" />
                    Mục yêu thích
                  </div>
                  <div className="mt-3 space-y-2">
                    {favorites.slice(0, 4).map((item) => (
                      <button
                        key={`favorite-${item.id}`}
                        type="button"
                        onClick={() => onOpenNode(item.id, item.section)}
                        className="flex w-full items-start justify-between gap-3 rounded-[10px] border border-[var(--line)] px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]"
                      >
                        <div>
                          <div className="text-sm font-bold text-[var(--ink)]">{item.title}</div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                            {SECTION_LABELS[item.section]}
                            {item.tag ? ` • ${item.tag}` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex items-center gap-2 text-base font-bold text-[var(--ink)]">
              <FolderOpen size={18} className="text-[var(--primary-dark)]" />
              Danh mục chính
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {HANDBOOK_QUICK_LINKS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onSelectSection(item.section)}
                  className="rounded-[12px] border border-[var(--line)] px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                >
                  <div className="text-sm font-bold text-[var(--primary-dark)]">{item.title}</div>
                  <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{item.description}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex items-center gap-2 text-base font-bold text-[var(--ink)]">
              <Database size={18} className="text-[var(--primary-dark)]" />
              Thống kê nội dung
            </div>
            <div className="mt-3 space-y-2">
              {summaries.map((item) => (
                <button
                  key={item.section}
                  type="button"
                  onClick={() => onSelectSection(item.section)}
                  className="flex w-full items-center justify-between rounded-[10px] border border-[var(--line)] px-3 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                >
                  <div className="text-sm font-bold text-[var(--ink)]">{SECTION_LABELS[item.section]}</div>
                  <div className="text-xl font-extrabold text-[var(--primary-dark)]">{item.count}</div>
                </button>
              ))}
            </div>
          </section>

          {feedbackEnabled && onSubmitFeedback ? (
            <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
              <div className="flex items-center gap-2 text-base font-bold text-[var(--ink)]">
                <MessageSquareQuote size={18} className="text-[var(--primary-dark)]" />
                Góp ý nhanh cho Sổ tay mới
              </div>
              <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                {currentUserName ? `Đăng nhập với ${currentUserName}.` : 'Bạn đang đăng nhập và có thể gửi góp ý nhanh.'}
              </div>
              <form className="mt-3 space-y-3" onSubmit={handleSubmitFeedback}>
                <select
                  value={feedbackRating}
                  onChange={(event) => setFeedbackRating(event.target.value)}
                  className="w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none"
                >
                  <option value="hữu ích">Nội dung hữu ích</option>
                  <option value="cần bổ sung">Cần bổ sung</option>
                  <option value="khó tìm">Khó tìm nội dung</option>
                  <option value="giao diện">Góp ý giao diện</option>
                </select>
                <textarea
                  value={feedbackContent}
                  onChange={(event) => setFeedbackContent(event.target.value)}
                  placeholder="Nhập góp ý hoặc nhu cầu chỉnh sửa nội dung..."
                  className="min-h-[110px] w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-3 text-sm leading-6 outline-none"
                />
                {feedbackMessage ? <div className="text-sm font-semibold text-emerald-700">{feedbackMessage}</div> : null}
                {feedbackError ? <div className="text-sm font-semibold text-[var(--primary-dark)]">{feedbackError}</div> : null}
                <button type="submit" disabled={feedbackSubmitting || !feedbackContent.trim()} className="primary-btn disabled:cursor-not-allowed disabled:opacity-60">
                  {feedbackSubmitting ? 'Đang gửi...' : 'Gửi góp ý'}
                </button>
              </form>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
            <div className="flex items-center gap-2 text-base font-bold text-[var(--ink)]">
              <BellRing size={18} className="text-[var(--primary-dark)]" />
              Thông báo mới
            </div>
            <div className="mt-3 space-y-3">
              {notices.length > 0 ? (
                notices.map((notice) => (
                  <div key={notice.id} className="border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
                    <div className="text-sm font-bold text-[var(--ink)]">{notice.title}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                      {notice.publishedAt ? new Date(notice.publishedAt).toLocaleDateString('vi-VN') : 'Chưa công bố ngày'}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{notice.content}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm leading-6 text-[var(--ink-soft)]">Chưa có thông báo nào trong bảng handbook_notices.</div>
              )}
            </div>
          </section>

          <section className="rounded-[14px] border border-[var(--line)] bg-white px-4 py-4">
            <div className="text-sm font-bold text-[var(--ink)]">Lối vào Hệ thống dữ liệu</div>
            <div className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
              Trên mobile, mục này sẽ đi bằng menu phụ để giữ 5 tab Sổ tay quen thuộc.
            </div>
            <button type="button" onClick={onOpenDataSystem} className="secondary-btn mt-3 inline-flex items-center gap-2">
              <Database size={16} />
              Vào Hệ thống dữ liệu
            </button>
          </section>

          <a
            href="https://supabase.com/dashboard/project/taivkgwwinakcoxhquyv/editor"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-dark)] hover:underline"
          >
            Mở Supabase để kiểm tra dữ liệu mẫu
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </div>
  );
}
