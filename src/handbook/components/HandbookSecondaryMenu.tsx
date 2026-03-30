import React from 'react';
import { Database, Settings, ShieldCheck, X } from 'lucide-react';

export function HandbookSecondaryMenu({
  isOpen,
  isAdmin,
  onClose,
  onOpenDataSystem,
  onOpenAdmin,
}: {
  isOpen: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onOpenDataSystem?: () => void;
  onOpenAdmin?: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(19,15,12,0.36)] md:hidden">
      <div className="ml-auto flex h-full w-full max-w-sm flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_48px_rgba(38,31,18,0.18)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--primary)]">Menu phụ</div>
            <div className="text-lg font-extrabold text-[var(--primary-dark)]">Tiện ích hệ thống</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="secondary-btn flex h-10 w-10 items-center justify-center !rounded-full !p-0"
            aria-label="Đóng menu phụ"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-5">
          <button
            type="button"
            onClick={onOpenDataSystem}
            className="flex w-full items-start gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-left"
          >
            <Database size={18} className="mt-1 text-[var(--primary-dark)]" />
            <div>
              <div className="font-bold text-[var(--ink)]">Hệ thống dữ liệu</div>
              <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Truy cập khu quản trị dữ liệu, tiếp nhận file và báo cáo tổng hợp.
              </div>
            </div>
          </button>

          <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-sm leading-6 text-[var(--ink-soft)]">
            Mobile vẫn giữ 5 tab Sổ tay như site cũ. Search, thông báo và lối vào dữ liệu được gom trong menu phụ để màn hình đỡ rối hơn.
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="flex w-full items-start gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-left"
            >
              <ShieldCheck size={18} className="mt-1 text-[var(--primary-dark)]" />
              <div>
                <div className="font-bold text-[var(--ink)]">Quản trị nội dung</div>
                <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  Điều hướng tới khu quản trị chung cho Quy định, Hỏi đáp, Biểu mẫu, Tài liệu và Hệ thống dữ liệu.
                </div>
              </div>
            </button>
          )}

          <div className="flex items-start gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-left">
            <Settings size={18} className="mt-1 text-[var(--primary-dark)]" />
            <div>
              <div className="font-bold text-[var(--ink)]">Ghi chú triển khai</div>
              <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Site sổ tay cũ vẫn chạy độc lập. Module mới này chỉ xây lại giao diện và lõi dữ liệu trên nền Supabase của repo hiện tại.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
