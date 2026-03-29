import React, { useMemo, useState } from 'react';
import { ArrowRight, Database, Search, ShieldUser } from 'lucide-react';
import { HANDBOOK_NAV_ITEMS, HANDBOOK_NOTICE_PREVIEWS, HANDBOOK_QUICK_LINKS } from './config';
import { HandbookBottomNav } from './components/HandbookBottomNav';
import { HandbookSecondaryMenu } from './components/HandbookSecondaryMenu';
import { HandbookTopBar } from './components/HandbookTopBar';
import { HandbookSection } from './types';

function getSectionTitle(section: HandbookSection) {
  switch (section) {
    case 'home':
      return 'Trang chủ';
    case 'quy-dinh':
      return 'Quy định';
    case 'hoi-dap':
      return 'Hỏi đáp';
    case 'bieu-mau':
      return 'Biểu mẫu';
    case 'tai-lieu':
      return 'Tài liệu';
    default:
      return 'Sổ tay';
  }
}

function SectionPlaceholder({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="panel-card rounded-[28px] p-6 md:p-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--primary)]">Module So tay moi</div>
        <h2 className="mt-3 text-[2rem] font-extrabold tracking-[-0.04em] text-[var(--primary-dark)]">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">{description}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_340px]">
        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Nhung viec se xay ra o pha tiep theo</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--ink)]">
            {bullets.map((bullet) => (
              <div key={bullet} className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-[var(--primary)]" />
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card rounded-[28px] p-6 md:p-7">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Trang thai hien tai</div>
          <div className="mt-4 rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--ink-soft)]">
            Day la khung giao dien moi duoc dung san trong repo `code-web-sotay`. No chua thay the site cu va cung chua duoc noi vao runtime chinh.
          </div>
        </div>
      </div>
    </div>
  );
}

export function HandbookShell({
  initialSection = 'home',
  isAdmin = false,
  onOpenDataSystem,
  onOpenAdmin,
}: {
  initialSection?: HandbookSection;
  isAdmin?: boolean;
  onOpenDataSystem?: () => void;
  onOpenAdmin?: () => void;
}) {
  const [activeSection, setActiveSection] = useState<HandbookSection>(initialSection);
  const [isSecondaryMenuOpen, setIsSecondaryMenuOpen] = useState(false);

  const activeSectionMeta = useMemo(
    () => HANDBOOK_NAV_ITEMS.find((item) => item.id === activeSection) || HANDBOOK_NAV_ITEMS[0],
    [activeSection],
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return (
          <div className="space-y-6">
            <div className="panel-card overflow-hidden rounded-[32px] border">
              <div className="grid gap-8 p-6 md:p-8 xl:grid-cols-[minmax(0,1.2fr)_380px]">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(179,15,20,0.18)] bg-[var(--primary-soft)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--primary-dark)]">
                    Xay moi So tay nghiep vu
                  </div>
                  <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--primary-dark)] md:text-[3rem]">
                    Cong thong tin thong nhat cho So tay nghiep vu va He thong du lieu
                  </h1>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--ink-soft)] md:text-[15px]">
                    Day la shell giao dien dau tien cua phan So tay moi duoc dung tren nen `code-web-sotay`. Muc tieu la giu
                    thoi quen 5 tab mobile cua site cu, dong thoi dua `He thong du lieu` vao cung mot he thong thong nhat.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveSection('quy-dinh')}
                      className="primary-btn inline-flex items-center gap-2"
                    >
                      Tra cuu So tay
                      <ArrowRight size={16} />
                    </button>
                    <button type="button" onClick={onOpenDataSystem} className="secondary-btn inline-flex items-center gap-2">
                      <Database size={16} />
                      Vao He thong du lieu
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="panel-soft rounded-[24px] p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Nguyen tac</div>
                    <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                      Khong dong vao repo/site cu `sotay-dangvien` trong suot qua trinh xay moi. Chi xuat du lieu tu site cu de migrate sang Supabase.
                    </div>
                  </div>
                  <div className="panel-soft rounded-[24px] p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Mobile</div>
                    <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                      Mobile giu 5 tab So tay quen thuoc. `He thong du lieu` duoc dua vao menu phu de khong lam roi bottom nav.
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
                  onClick={() => setActiveSection(item.section)}
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
                    <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Cau truc dieu huong</div>
                    <div className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[var(--primary-dark)]">6 muc chinh cua he thong moi</div>
                  </div>
                  <Search size={18} className="text-[var(--primary-dark)]" />
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {HANDBOOK_NAV_ITEMS.map((item) => (
                    <div key={item.id} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)]">
                          <item.icon size={18} />
                        </div>
                        <div className="font-bold text-[var(--ink)]">{item.label}</div>
                      </div>
                      <div className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-card rounded-[28px] p-6 md:p-7">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Cap nhat moi</div>
                <div className="mt-4 space-y-4">
                  {HANDBOOK_NOTICE_PREVIEWS.map((notice) => (
                    <div key={notice.id} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                      <div className="text-sm font-bold text-[var(--ink)]">{notice.title}</div>
                      <div className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{notice.summary}</div>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
                        {notice.publishedAt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'quy-dinh':
        return (
          <SectionPlaceholder
            title="Quy định"
            description="Khu nay se nhan du lieu migrate tu cay noi dung Firestore cu, nhung duoc render lai tren nen React + Supabase de de tim kiem, de quan tri va on dinh hon."
            bullets={[
              'Doc danh sach node section = quy-dinh tu Supabase.',
              'Dung lai trai nghiem breadcrumb, expand/collapse va doc tap trung cua site cu.',
              'Cho phep mo nhanh PDF can cu va nhay ve tai lieu goc.',
            ]}
          />
        );
      case 'hoi-dap':
        return (
          <SectionPlaceholder
            title="Hỏi đáp"
            description="Khu tong hop tinh huong nghiep vu, cau hoi thuong gap va cau tra loi ngan. Muc tieu la giu trai nghiem nhanh, de tim va nhin dung ngu canh."
            bullets={[
              'Map tag cu co chua hoi dap sang section hoi-dap.',
              'Tim kiem uu tien theo tieu de, tag va tom tat.',
              'Co the mo rong them luong AI tra cuu sau pha dich chuyen noi dung.',
            ]}
          />
        );
      case 'bieu-mau':
        return (
          <SectionPlaceholder
            title="Biểu mẫu"
            description="Day la khu tai ve bieu mau cua So tay, khac voi module hoc bieu/bao cao trong He thong du lieu. No se tap trung vao kho file, phan loai va tra cuu nhanh."
            bullets={[
              'Map node co tag bieu mau hoac co fileUrl sang section bieu-mau.',
              'Ho tro tai file nhanh va mo file goc.',
              'Co the lien ket cheo sang He thong du lieu khi can thao tac nhap/tong hop.',
            ]}
          />
        );
      case 'tai-lieu':
        return (
          <SectionPlaceholder
            title="Tài liệu"
            description="Kho van ban, huong dan, PDF tham khao va tai lieu nen. Day cung la noi se tiep tuc dung PDF viewer va co bo loc theo loai noi dung."
            bullets={[
              'Map tag tai lieu sang section tai-lieu.',
              'Chuan hoa file_url, file_name va pdf_refs.',
              'Bo sung bo loc theo loai tai lieu va thong ke luot mo.',
            ]}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-transparent px-4 py-4 md:px-6 md:py-6 xl:px-8">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-6 pb-24 md:pb-8">
        <HandbookTopBar
          title={getSectionTitle(activeSection)}
          onToggleMenu={() => setIsSecondaryMenuOpen(true)}
          onOpenSearch={() => setActiveSection('home')}
          onOpenNotices={() => setActiveSection('home')}
          onOpenAdmin={onOpenAdmin}
        />

        <div className="hidden grid-cols-5 gap-3 md:grid">
          {HANDBOOK_NAV_ITEMS.map((item) => {
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`panel-card rounded-[24px] px-4 py-4 text-left transition-transform hover:-translate-y-0.5 ${
                  isActive ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--primary-dark)] shadow-[0_8px_18px_rgba(38,31,18,0.08)]">
                    <item.icon size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-[var(--ink)]">{item.label}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{item.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {renderSection()}

        <div className="panel-card rounded-[28px] border p-6 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Loi vao He thong du lieu</div>
              <div className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[var(--primary-dark)]">Menu phụ trên mobile, mục chính trên desktop</div>
              <div className="mt-3 max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">
                Theo quyet dinh da chot, `He thong du lieu` se duoc dua vao menu phu tren mobile de giu 5 tab So tay gon va quen thuoc.
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onOpenDataSystem} className="primary-btn inline-flex items-center gap-2">
                <Database size={16} />
                He thong du lieu
              </button>
              {isAdmin && (
                <button type="button" onClick={onOpenAdmin} className="secondary-btn inline-flex items-center gap-2">
                  <ShieldUser size={16} />
                  Quan tri chung
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <HandbookSecondaryMenu
        isOpen={isSecondaryMenuOpen}
        isAdmin={isAdmin}
        onClose={() => setIsSecondaryMenuOpen(false)}
        onOpenDataSystem={() => {
          setIsSecondaryMenuOpen(false);
          onOpenDataSystem?.();
        }}
        onOpenAdmin={() => {
          setIsSecondaryMenuOpen(false);
          onOpenAdmin?.();
        }}
      />

      <HandbookBottomNav activeSection={activeSection} onSelectSection={setActiveSection} />
    </div>
  );
}
