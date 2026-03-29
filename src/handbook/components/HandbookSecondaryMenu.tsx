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
    <div className="fixed inset-0 z-40 bg-[rgba(19,15,12,0.32)] px-4 py-6 md:hidden">
      <div className="ml-auto w-full max-w-sm rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_24px_48px_rgba(38,31,18,0.18)]">
        <div className="mb-4 flex items-center justify-between">
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

        <div className="space-y-3">
          <button
            type="button"
            onClick={onOpenDataSystem}
            className="panel-soft flex w-full items-start gap-3 rounded-[22px] px-4 py-4 text-left"
          >
            <Database size={18} className="mt-1 text-[var(--primary-dark)]" />
            <div>
              <div className="font-bold text-[var(--ink)]">Hệ thống dữ liệu</div>
              <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Truy cập khu quản trị dữ liệu, tiếp nhận file và báo cáo tổng hợp.
              </div>
            </div>
          </button>

          <div className="panel-soft rounded-[22px] px-4 py-4 text-sm leading-6 text-[var(--ink-soft)]">
            Search, thông báo và tài khoản sẽ tiếp tục được gom vào khung điều hướng này trên mobile để giữ 5 tab Sổ tay gọn như site cũ.
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="panel-soft flex w-full items-start gap-3 rounded-[22px] px-4 py-4 text-left"
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

          <div className="panel-soft flex items-start gap-3 rounded-[22px] px-4 py-4 text-left">
            <Settings size={18} className="mt-1 text-[var(--primary-dark)]" />
            <div>
              <div className="font-bold text-[var(--ink)]">Ghi chú triển khai</div>
              <div className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Module So tay đang được chuẩn bị sẵn trong repo mới và chua gan vao runtime chinh de tranh rung he thong dang van hanh.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

