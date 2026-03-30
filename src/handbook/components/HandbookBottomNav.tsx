import React from 'react';
import { HANDBOOK_NAV_ITEMS } from '../config';
import { HandbookSection } from '../types';

export function HandbookBottomNav({
  activeSection,
  onSelectSection,
}: {
  activeSection: HandbookSection;
  onSelectSection: (section: HandbookSection) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--legacy-border)] bg-[var(--legacy-bg-box)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {HANDBOOK_NAV_ITEMS.map((item) => {
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`flex min-h-[65px] flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] font-semibold ${
                isActive ? 'text-[var(--legacy-primary)]' : 'text-[var(--legacy-text-muted)]'
              }`}
            >
              <item.icon size={16} />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
