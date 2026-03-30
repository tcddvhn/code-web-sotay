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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/98 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(38,31,18,0.08)] md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {HANDBOOK_NAV_ITEMS.map((item) => {
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold ${
                isActive ? 'bg-[var(--primary-soft)] text-[var(--primary-dark)]' : 'text-[var(--ink-soft)]'
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
