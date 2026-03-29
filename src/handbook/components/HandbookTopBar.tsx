import React from 'react';
import { Bell, Menu, Search, ShieldUser } from 'lucide-react';

export function HandbookTopBar({
  title,
  onToggleMenu,
  onOpenSearch,
  onOpenNotices,
  onOpenAdmin,
}: {
  title: string;
  onToggleMenu?: () => void;
  onOpenSearch?: () => void;
  onOpenNotices?: () => void;
  onOpenAdmin?: () => void;
}) {
  return (
    <header className="panel-card rounded-[28px] border px-4 py-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMenu}
          className="secondary-btn flex h-11 w-11 items-center justify-center !rounded-full !p-0 md:hidden"
          aria-label="Mở menu phụ"
        >
          <Menu size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--primary)]">Sổ tay nghiệp vụ</div>
          <div className="truncate text-xl font-extrabold tracking-[-0.03em] text-[var(--primary-dark)] md:text-2xl">{title}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="secondary-btn flex h-11 w-11 items-center justify-center !rounded-full !p-0"
            aria-label="Tìm kiếm"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenNotices}
            className="secondary-btn hidden h-11 w-11 items-center justify-center !rounded-full !p-0 md:flex"
            aria-label="Thông báo"
          >
            <Bell size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="secondary-btn hidden h-11 w-11 items-center justify-center !rounded-full !p-0 md:flex"
            aria-label="Quản trị"
          >
            <ShieldUser size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

