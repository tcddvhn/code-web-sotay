import React, { useState } from 'react';
import { BellRing, Bookmark, BookOpen, Clock3, Database, Folder, LibraryBig, MessageSquareQuote, Search } from 'lucide-react';
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

  const totalContent = summaries.reduce((sum, item) => sum + item.count, 0);

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
    <div>
      <div className="legacy-hero-search">
        <h2>Bạn cần tôi giúp gì hôm nay?</h2>
        <p>Tra cứu nhanh nội dung nghiệp vụ, câu hỏi, biểu mẫu và tài liệu theo đúng cách gọi quen thuộc.</p>
        <div className="legacy-hero-search-box">
          <input
            type="text"
            placeholder="Nhập từ khóa (mất thẻ đảng...)"
            readOnly
            onClick={onOpenSearch}
          />
          <button type="button" onClick={onOpenSearch}>TÌM</button>
        </div>
        <div className="legacy-hero-search-actions">
          <button type="button" className="legacy-chip" onClick={onOpenSearch}>Hỏi AI</button>
        </div>
        <div className="legacy-chip-row mt-3">
          {['mất thẻ đảng', 'chuyển sinh hoạt', 'miễn sinh hoạt', 'mẫu báo cáo'].map((chip) => (
            <button key={chip} type="button" className="legacy-chip" onClick={onOpenSearch}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      {recentViews[0] ? (
        <div className="legacy-continue-banner">
          <div className="legacy-continue-text">Tiếp tục đọc mục:</div>
          <div className="legacy-continue-title">{recentViews[0].title}</div>
          <button type="button" className="legacy-btn-mini legacy-btn-mini-detail" onClick={() => onOpenNode(recentViews[0].id, recentViews[0].section)}>
            Mở lại
          </button>
        </div>
      ) : null}

      {favorites.length > 0 ? (
        <div className="legacy-recent-box">
          <div className="legacy-recent-title">
            <BookOpen size={18} />
            Mục yêu thích
          </div>
          <div>
            {favorites.slice(0, 6).map((item) => (
              <button
                key={`favorite-${item.id}`}
                type="button"
                onClick={() => onOpenNode(item.id, item.section)}
                className="legacy-favorite-item"
              >
                <Bookmark size={16} className="shrink-0 text-[var(--legacy-primary)]" />
                <span className="truncate">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {recentViews.length > 0 ? (
        <div className="legacy-recent-box">
          <div className="legacy-recent-title">
            <Clock3 size={18} />
            Vừa xem gần đây
          </div>
          <div>
            {recentViews.slice(0, 6).map((item) => (
              <button
                key={`recent-${item.id}`}
                type="button"
                onClick={() => onOpenNode(item.id, item.section)}
                className="legacy-recent-list-item"
              >
                <Clock3 size={16} className="shrink-0 text-[var(--legacy-text-muted)]" />
                <span className="truncate">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="legacy-recent-title" style={{ border: 'none', color: 'var(--legacy-text-main)', fontSize: '1.1rem', marginTop: '25px' }}>
        <Folder size={20} color="var(--legacy-primary)" />
        Danh mục Quy định chính
      </div>
      <div className="legacy-home-grid">
        {HANDBOOK_QUICK_LINKS.map((item) => {
          const Icon = item.section === 'quy-dinh' ? LibraryBig : item.section === 'hoi-dap' ? MessageSquareQuote : item.section === 'bieu-mau' ? Bookmark : BellRing;
          return (
            <button key={item.title} type="button" className="legacy-home-card" onClick={() => onSelectSection(item.section)}>
              <div className="legacy-card-icon">
                <Icon size={28} />
              </div>
              <div className="legacy-card-title">{item.title}</div>
            </button>
          );
        })}
      </div>

      <div className="legacy-recent-title" style={{ border: 'none', color: 'var(--legacy-text-main)', fontSize: '1.1rem', marginTop: '35px' }}>
        <Database size={20} color="var(--legacy-primary)" />
        Thống kê truy cập
      </div>
      <div className="legacy-stats-box">
        <div className="legacy-stat-row">
          <span>Tổng số nội dung Sổ tay</span>
          <b>{totalContent}</b>
        </div>
        {summaries.map((item) => (
          <div key={item.section} className="legacy-stat-row">
            <span>{SECTION_LABELS[item.section]}</span>
            <b>{item.count}</b>
          </div>
        ))}
        <div className="legacy-stat-row">
          <span>Lượt yêu thích gần đây</span>
          <b>{favorites.length}</b>
        </div>
      </div>

      {feedbackEnabled && onSubmitFeedback ? (
        <div className="legacy-action-group">
          <form className="legacy-recent-box" onSubmit={handleSubmitFeedback}>
            <div className="legacy-recent-title">
              <MessageSquareQuote size={18} />
              Đóng góp ý kiến
            </div>
            <div className="mb-3 text-sm text-[var(--legacy-text-muted)]">
              {currentUserName ? `Đăng nhập với ${currentUserName}.` : 'Bạn đang đăng nhập và có thể gửi góp ý nhanh.'}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {['hữu ích', 'cần bổ sung', 'khó tìm', 'giao diện'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFeedbackRating(item)}
                  className="legacy-chip"
                  style={feedbackRating === item ? { borderColor: 'var(--legacy-primary)', color: 'var(--legacy-primary)' } : undefined}
                >
                  {item}
                </button>
              ))}
            </div>
            <textarea
              value={feedbackContent}
              onChange={(event) => setFeedbackContent(event.target.value)}
              placeholder="Nhập góp ý hoặc nhu cầu chỉnh sửa nội dung..."
              className="min-h-[120px] w-full rounded-[4px] border border-[var(--legacy-border)] bg-[var(--legacy-bg-box)] px-3 py-3 text-[0.95rem] outline-none"
            />
            {feedbackMessage ? <div className="mt-3 text-sm font-semibold text-emerald-700">{feedbackMessage}</div> : null}
            {feedbackError ? <div className="mt-3 text-sm font-semibold text-[var(--legacy-primary-dark)]">{feedbackError}</div> : null}
            <div className="mt-4 flex gap-3">
              <button type="submit" disabled={feedbackSubmitting || !feedbackContent.trim()} className="legacy-action-btn-flat legacy-feedback-btn max-w-[220px] disabled:cursor-not-allowed disabled:opacity-60">
                <MessageSquareQuote size={20} />
                <span>{feedbackSubmitting ? 'ĐANG GỬI...' : 'ĐÓNG GÓP Ý KIẾN'}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div className="legacy-recent-box">
          <div className="legacy-recent-title">
            <BellRing size={18} />
            Thông báo mới
          </div>
          <div className="space-y-3">
            {notices.map((notice) => (
              <div key={notice.id} className="border-b border-[var(--legacy-border-light)] pb-3 last:border-b-0 last:pb-0">
                <div className="font-bold text-[var(--legacy-text-main)]">{notice.title}</div>
                <div className="mt-1 text-sm text-[var(--legacy-text-muted)]">{notice.content}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="legacy-recent-box">
        <div className="legacy-recent-title">
          <Database size={18} />
          Hệ thống dữ liệu
        </div>
        <div className="text-sm text-[var(--legacy-text-muted)]">
          Truy cập khu quản trị dữ liệu, tiếp nhận file và báo cáo tổng hợp.
        </div>
        <div className="mt-4">
          <button type="button" className="legacy-action-btn-flat legacy-feedback-btn max-w-[220px]" onClick={onOpenDataSystem}>
            <Database size={20} />
            <span>VÀO HỆ THỐNG DỮ LIỆU</span>
          </button>
        </div>
      </div>
    </div>
  );
}
