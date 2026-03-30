import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, Save, Trash2 } from 'lucide-react';
import { HandbookNoticeItem } from '../types';

function createNoticeDraft(): HandbookNoticeItem {
  return {
    id: `notice_${Date.now()}`,
    title: '',
    content: '',
    publishedAt: new Date().toISOString(),
    isPublished: true,
  };
}

export function HandbookNoticesAdminPage({
  notices,
  onSave,
  onDelete,
}: {
  notices: HandbookNoticeItem[];
  onSave: (notice: HandbookNoticeItem) => Promise<void>;
  onDelete: (noticeId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<HandbookNoticeItem>(notices[0] || createNoticeDraft());
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.id && notices[0]) {
      setDraft(notices[0]);
      return;
    }

    const updated = notices.find((notice) => notice.id === draft.id);
    if (updated) {
      setDraft(updated);
    }
  }, [draft.id, notices]);

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="panel-card rounded-[28px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">handbook_notices</div>
            <div className="mt-1 text-lg font-extrabold text-[var(--primary-dark)]">Quản lý thông báo</div>
          </div>
          <button type="button" onClick={() => { setDraft(createNoticeDraft()); setStatus(null); }} className="primary-btn inline-flex items-center gap-2">
            <Plus size={15} />
            Tạo thông báo
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {notices.map((notice) => (
            <button
              key={notice.id}
              type="button"
              onClick={() => { setDraft(notice); setStatus(null); }}
              className={`w-full rounded-[22px] border px-4 py-3 text-left ${draft.id === notice.id ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--line)] bg-[var(--surface-soft)]'}`}
            >
              <div className="text-sm font-bold text-[var(--ink)]">{notice.title || 'Thông báo chưa đặt tên'}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card rounded-[28px] p-6 md:p-7">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
          <Megaphone size={18} />
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-semibold text-[var(--ink)]">
            Tiêu đề
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-[var(--ink)]">
              Published at
              <input value={draft.publishedAt || ''} onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })} className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
              <input type="checkbox" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} />
              Đang xuất bản
            </label>
          </div>
          <label className="block text-sm font-semibold text-[var(--ink)]">
            Nội dung
            <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} className="mt-2 h-56 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 outline-none" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={async () => {
                await onSave(draft);
                setStatus('Đã lưu thông báo handbook.');
              }}
              className="primary-btn inline-flex items-center gap-2"
            >
              <Save size={15} />
              Lưu thông báo
            </button>
            <button
              type="button"
              onClick={async () => {
                await onDelete(draft.id);
                setDraft(createNoticeDraft());
                setStatus('Đã xóa thông báo handbook.');
              }}
              className="secondary-btn inline-flex items-center gap-2"
            >
              <Trash2 size={15} />
              Xóa thông báo
            </button>
          </div>
          {status ? <div className="text-sm text-[var(--ink-soft)]">{status}</div> : null}
        </div>
      </div>
    </div>
  );
}
