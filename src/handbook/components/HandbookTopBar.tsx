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
    <header
      className="fixed inset-x-0 top-0 z-40 border-b border-[rgba(255,255,255,0.18)] text-white shadow-[0_14px_30px_rgba(125,7,9,0.22)]"
      style={{
        background:
          "linear-gradient(rgba(204, 0, 0, 0.85), rgba(204, 0, 0, 0.85)), url('https://i.postimg.cc/zf6J3RQ8/img_5_hinh_nen_powerpoint_trong_dong.jpg') center/cover",
      }}
    >
      <div className="mx-auto flex h-[72px] max-w-[1520px] items-center gap-2 px-3 md:h-[74px] md:px-6 xl:px-8">
        <button
          type="button"
          onClick={onToggleMenu}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/95 transition hover:bg-white/10 md:hidden"
          aria-label="Mở menu phụ"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold uppercase tracking-[0.03em] md:text-[18px]">
            SỔ TAY NGHIỆP VỤ TCĐ, ĐV
          </div>
          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75 md:text-xs">
            {title}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/95 transition hover:bg-white/10"
            aria-label="Tìm kiếm"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={onOpenNotices}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/95 transition hover:bg-white/10"
            aria-label="Thông báo"
          >
            <Bell size={20} />
          </button>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-white/95 transition hover:bg-white/10 md:flex"
            aria-label="Quản trị"
          >
            <ShieldUser size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
