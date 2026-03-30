import React, { useState } from 'react';
import { BellRing, Bookmark, Clock3, Database, ExternalLink, FolderOpen, MessageSquareQuote, Sparkles } from 'lucide-react';
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
    <div className="space-y-6">
      <div className="panel-card overflow-hidden rounded-[32px] border">
        <div className="grid gap-8 p-6 md:p-8 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(179,15,20,0.18)] bg-[var(--primary-soft)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--primary-dark)]">
              Sổ tay nghiệp vụ mới
            </div>
            <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--primary-dark)] md:text-[3rem]">
              Cổng tra cứu thống nhất cho nội dung Sổ tay và Hệ thống dữ liệu
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--ink-soft)] md:text-[15px]">
              Module Sổ tay mới đang được đọc trực tiếp từ dữ liệu Supabase. Giao diện giữ thói quen 5 tab mobile của hệ cũ,
              đồng thời chuẩn bị sẵn cấu trúc để quản trị nội dung tập trung trong các pha tiếp theo.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => onSelectSection('quy-dinh')} className="primary-btn inline-flex items-center gap-2">
                Bắt đầu tra cứu
                <Sparkles size={16} />
              </button>
              <button type="button" onClick={onOpenDataSystem} className="secondary-btn inline-flex items-center gap-2">
                <Database size={16} />
                Vào Hệ thống dữ liệu
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="panel-soft rounded-[24px] p-5">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Nguyên tắc triển khai</div>
              <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                Không sửa site cũ trong giai đoạn xây mới. Module này chỉ đọc dữ liệu đã migrate sang Supabase và tách độc lập với luồng hệ thống dữ liệu đang vận hành.
              </div>
            </div>
            <div className="panel-soft rounded-[24px] p-5">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Tiến độ pha đọc</div>
              <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                Đã có shell, schema và adapter nội dung. Mục tiêu tiếp theo là hoàn thiện trang đọc, sau đó mới bước sang khu quản trị nội dung.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {HANDBOOK_QUICK_LINKS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onSelectSection(item.section)}
            className="panel-card rounded-[26px] p-5 text-left transition-transform hover:-translate-y-0.5"
          >
            <div className="text-sm font-extrabold text-[var(--primary-dark)]">{item.title}</div>
            <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">{item.description}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Dữ liệu đã sẵn sàng</div>
              <div className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[var(--primary-dark)]">4 khu nội dung cốt lõi</div>
            </div>
            <FolderOpen size={18} className="text-[var(--primary-dark)]" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {summaries.map((item) => (
              <button
                key={item.section}
                type="button"
                onClick={() => onSelectSection(item.section)}
                className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-left transition-transform hover:-translate-y-0.5"
              >
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">{SECTION_LABELS[item.section]}</div>
                <div className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-[var(--primary-dark)]">{item.count}</div>
                <div className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">Số node đang được xuất bản trong section này.</div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="flex items-center gap-3">
            <BellRing size={18} className="text-[var(--primary-dark)]" />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Thông báo mới</div>
              <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Từ bảng handbook_notices</div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {notices.length > 0 ? (
              notices.map((notice) => (
                <div key={notice.id} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <div className="text-sm font-bold text-[var(--ink)]">{notice.title}</div>
                  <div className="mt-2 line-clamp-4 text-sm leading-7 text-[var(--ink-soft)]">{notice.content}</div>
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    {notice.publishedAt ? new Date(notice.publishedAt).toLocaleDateString('vi-VN') : 'Chưa có ngày đăng'}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
                Chưa có thông báo nào được xuất bản trong bảng <code>handbook_notices</code>.
              </div>
            )}
          </div>

          <a
            href="https://supabase.com/dashboard/project/taivkgwwinakcoxhquyv/editor"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-dark)] hover:underline"
          >
            Mở Supabase để cập nhật dữ liệu mẫu
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="flex items-center gap-3">
            <Clock3 size={18} className="text-[var(--primary-dark)]" />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Vừa xem</div>
              <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Dành cho người dùng đã đăng nhập</div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {recentViews.length > 0 ? (
              recentViews.map((item) => (
                <button
                  key={`recent-${item.id}`}
                  type="button"
                  onClick={() => onOpenNode(item.id, item.section)}
                  className="w-full rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="text-sm font-bold text-[var(--ink)]">{item.title}</div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    {SECTION_LABELS[item.section]} {item.tag ? `• ${item.tag}` : ''}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
                Chưa có lịch sử vừa xem. Khi người dùng mở nội dung trong Sổ tay mới, các mục gần đây sẽ xuất hiện ở đây.
              </div>
            )}
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="flex items-center gap-3">
            <Bookmark size={18} className="text-[var(--primary-dark)]" />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Yêu thích</div>
              <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Danh sách mục đã đánh dấu</div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {favorites.length > 0 ? (
              favorites.map((item) => (
                <button
                  key={`favorite-${item.id}`}
                  type="button"
                  onClick={() => onOpenNode(item.id, item.section)}
                  className="w-full rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="text-sm font-bold text-[var(--ink)]">{item.title}</div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                    {SECTION_LABELS[item.section]} {item.tag ? `• ${item.tag}` : ''}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
                Chưa có mục yêu thích nào. Người dùng có thể đánh dấu trực tiếp tại màn hình đọc nội dung để lưu lại.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel-card rounded-[28px] p-6 md:p-7">
        <div className="flex items-center gap-3">
          <MessageSquareQuote size={18} className="text-[var(--primary-dark)]" />
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Góp ý nhanh</div>
            <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Phản hồi trực tiếp cho handbook mới</div>
          </div>
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={handleSubmitFeedback} className="space-y-4">
            <div className="text-sm leading-7 text-[var(--ink-soft)]">
              {feedbackEnabled
                ? `Đăng nhập với ${currentUserName || 'tài khoản hiện tại'} để gửi góp ý ngay trong giai đoạn hoàn thiện module handbook mới.`
                : 'Đăng nhập để gửi góp ý, phản hồi trải nghiệm hoặc đề xuất cải tiến cho handbook mới.'}
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Mức độ</div>
                <select
                  value={feedbackRating}
                  onChange={(event) => setFeedbackRating(event.target.value)}
                  disabled={!feedbackEnabled || feedbackSubmitting}
                  className="w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--primary)]"
                >
                  <option value="hữu ích">Hữu ích</option>
                  <option value="tạm ổn">Tạm ổn</option>
                  <option value="cần cải thiện">Cần cải thiện</option>
                </select>
              </label>
              <label className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Nội dung góp ý</div>
                <textarea
                  value={feedbackContent}
                  onChange={(event) => setFeedbackContent(event.target.value)}
                  disabled={!feedbackEnabled || feedbackSubmitting}
                  rows={4}
                  placeholder={feedbackEnabled ? 'Ví dụ: điều hướng mobile nên gọn hơn, tìm kiếm nên ưu tiên theo tiêu đề...' : 'Đăng nhập để gửi góp ý'}
                  className="w-full rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-[var(--primary)] disabled:bg-[var(--surface-soft)]"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!feedbackEnabled || feedbackSubmitting || !feedbackContent.trim()} className="primary-btn">
                {feedbackSubmitting ? 'Đang gửi...' : 'Gửi góp ý'}
              </button>
              {feedbackMessage ? <div className="text-sm font-semibold text-emerald-700">{feedbackMessage}</div> : null}
              {feedbackError ? <div className="text-sm font-semibold text-[var(--primary-dark)]">{feedbackError}</div> : null}
            </div>
          </form>

          <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-soft)] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Mục đích</div>
            <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
              Kênh này ghi thẳng vào bảng <code>handbook_feedback</code> để admin theo dõi phản hồi trong giai đoạn xây mới, hoàn toàn tách khỏi site sổ tay cũ đang vận hành.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
