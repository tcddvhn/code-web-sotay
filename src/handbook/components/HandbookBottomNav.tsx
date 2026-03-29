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
    <nav className="panel-card fixed inset-x-4 bottom-4 z-30 rounded-[26px] border px-3 py-2 shadow-[0_18px_42px_rgba(38,31,18,0.16)] md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {HANDBOOK_NAV_ITEMS.map((item) => {
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold ${
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

