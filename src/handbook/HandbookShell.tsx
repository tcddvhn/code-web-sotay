import React, { useEffect, useMemo, useState } from 'react';
import { Database, ShieldUser, X } from 'lucide-react';
import { HANDBOOK_NAV_ITEMS } from './config';
import { HandbookBottomNav } from './components/HandbookBottomNav';
import { HandbookSecondaryMenu } from './components/HandbookSecondaryMenu';
import { HandbookTopBar } from './components/HandbookTopBar';
import { DocumentsPage } from './pages/DocumentsPage';
import { FaqPage } from './pages/FaqPage';
import { FormsPage } from './pages/FormsPage';
import { HomePage } from './pages/HomePage';
import { RegulationsPage } from './pages/RegulationsPage';
import { SearchPage } from './pages/SearchPage';
import { listHandbookNodesBySection, listHandbookNotices, listHandbookSectionSummaries, searchHandbookNodes } from './services/handbookContent';
import { deleteHandbookNode, deleteHandbookNotice, listAllHandbookNodesForAdmin, listHandbookNoticesForAdmin, upsertHandbookNode, upsertHandbookNotice } from './services/handbookAdmin';
import { HandbookContentSection, HandbookNodeOutlineItem, HandbookNodeRecord, HandbookNoticeItem, HandbookSection, HandbookSectionSummary } from './types';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { HandbookNodesAdminPage } from './admin/HandbookNodesAdminPage';
import { HandbookNoticesAdminPage } from './admin/HandbookNoticesAdminPage';

type HandbookAdminView = 'dashboard' | 'nodes' | 'notices';

const EMPTY_SUMMARIES: HandbookSectionSummary[] = [
  { section: 'quy-dinh', count: 0 },
  { section: 'hoi-dap', count: 0 },
  { section: 'bieu-mau', count: 0 },
  { section: 'tai-lieu', count: 0 },
];

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminView, setAdminView] = useState<HandbookAdminView>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HandbookNodeOutlineItem[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<HandbookSectionSummary[]>(EMPTY_SUMMARIES);
  const [notices, setNotices] = useState<HandbookNoticeItem[]>([]);
  const [shellError, setShellError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminNodes, setAdminNodes] = useState<HandbookNodeRecord[]>([]);
  const [adminNotices, setAdminNotices] = useState<HandbookNoticeItem[]>([]);
  const [sectionNodes, setSectionNodes] = useState<Record<HandbookContentSection, HandbookNodeOutlineItem[]>>({
    'quy-dinh': [],
    'hoi-dap': [],
    'bieu-mau': [],
    'tai-lieu': [],
  });
  const [sectionLoading, setSectionLoading] = useState<Record<HandbookContentSection, boolean>>({
    'quy-dinh': false,
    'hoi-dap': false,
    'bieu-mau': false,
    'tai-lieu': false,
  });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Partial<Record<HandbookContentSection, string>>>({});

  const refreshHomeData = async () => {
    const [summaryData, noticeData] = await Promise.all([listHandbookSectionSummaries(), listHandbookNotices(4)]);
    setSummaries(summaryData);
    setNotices(noticeData);
  };

  const refreshAdminData = async () => {
    const [nodes, noticesData] = await Promise.all([
      listAllHandbookNodesForAdmin(),
      listHandbookNoticesForAdmin(),
    ]);
    setAdminNodes(nodes);
    setAdminNotices(noticesData);
  };

  useEffect(() => {
    let cancelled = false;

    refreshHomeData()
      .then(() => {
        if (!cancelled) {
          setShellError(null);
        }
      })
      .catch((error) => {
        console.error('Handbook home load error:', error);
        if (!cancelled) {
          setShellError(error instanceof Error ? error.message : 'Không thể tải dữ liệu homepage của Sổ tay.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAdminOpen || !isAdmin) {
      return;
    }

    let cancelled = false;
    refreshAdminData()
      .then(() => {
        if (!cancelled) {
          setAdminError(null);
        }
      })
      .catch((error) => {
        console.error('Handbook admin load error:', error);
        if (!cancelled) {
          setAdminError(error instanceof Error ? error.message : 'Không thể tải dữ liệu admin handbook.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminOpen, isAdmin]);

  useEffect(() => {
    if (activeSection === 'home') {
      return;
    }

    let cancelled = false;
    const targetSection = activeSection as HandbookContentSection;
    setSectionLoading((current) => ({ ...current, [targetSection]: true }));

    listHandbookNodesBySection(targetSection)
      .then((nodes) => {
        if (cancelled) {
          return;
        }
        setSectionNodes((current) => ({ ...current, [targetSection]: nodes }));
        setSelectedNodeIds((current) => ({
          ...current,
          [targetSection]: current[targetSection] && nodes.some((node) => node.id === current[targetSection])
            ? current[targetSection]
            : nodes[0]?.id,
        }));
      })
      .catch((error) => {
        console.error(`Handbook section load error (${targetSection}):`, error);
        if (!cancelled) {
          setShellError(error instanceof Error ? error.message : 'Không thể tải dữ liệu section handbook.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSectionLoading((current) => ({ ...current, [targetSection]: false }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setIsSearchLoading(true);
        const results = await searchHandbookNodes(trimmedQuery);
        if (!cancelled) {
          setSearchResults(results);
          setSearchError(null);
        }
      } catch (error) {
        console.error('Handbook search error:', error);
        if (!cancelled) {
          setSearchError(error instanceof Error ? error.message : 'Không thể tìm kiếm dữ liệu handbook.');
        }
      } finally {
        if (!cancelled) {
          setIsSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSearchOpen, searchQuery]);

  const activeSectionMeta = useMemo(
    () => HANDBOOK_NAV_ITEMS.find((item) => item.id === activeSection) || HANDBOOK_NAV_ITEMS[0],
    [activeSection],
  );

  const renderSection = () => {
    if (shellError) {
      return (
        <div className="panel-card rounded-[28px] border border-[rgba(179,15,20,0.2)] bg-[rgba(179,15,20,0.05)] p-6 text-sm leading-7 text-[var(--primary-dark)]">
          {shellError}
        </div>
      );
    }

    if (activeSection === 'home') {
      return (
        <HomePage
          summaries={summaries}
          notices={notices}
          onSelectSection={setActiveSection}
          onOpenDataSystem={onOpenDataSystem}
        />
      );
    }

    const currentNodes = sectionNodes[activeSection as HandbookContentSection] || [];
    const currentSelectedNodeId = selectedNodeIds[activeSection as HandbookContentSection] || null;
    const setSelectedNode = (nodeId: string) => {
      setSelectedNodeIds((current) => ({
        ...current,
        [activeSection as HandbookContentSection]: nodeId,
      }));
    };

    if (sectionLoading[activeSection as HandbookContentSection]) {
      return (
        <div className="panel-card rounded-[28px] p-6 text-sm leading-7 text-[var(--ink-soft)]">
          Đang tải dữ liệu section <strong>{activeSectionMeta.label}</strong> từ Supabase...
        </div>
      );
    }

    switch (activeSection) {
      case 'quy-dinh':
        return <RegulationsPage nodes={currentNodes} selectedNodeId={currentSelectedNodeId} onSelectNode={setSelectedNode} />;
      case 'hoi-dap':
        return <FaqPage nodes={currentNodes} selectedNodeId={currentSelectedNodeId} onSelectNode={setSelectedNode} />;
      case 'bieu-mau':
        return <FormsPage nodes={currentNodes} selectedNodeId={currentSelectedNodeId} onSelectNode={setSelectedNode} />;
      case 'tai-lieu':
        return <DocumentsPage nodes={currentNodes} selectedNodeId={currentSelectedNodeId} onSelectNode={setSelectedNode} />;
      default:
        return null;
    }
  };

  const handleSelectSearchResult = (item: HandbookNodeOutlineItem) => {
    setSelectedNodeIds((current) => ({
      ...current,
      [item.section]: item.id,
    }));
    setActiveSection(item.section);
    setIsSearchOpen(false);
  };

  const renderAdminPanel = () => {
    if (adminError) {
      return <div className="rounded-[22px] border border-[rgba(179,15,20,0.2)] bg-[rgba(179,15,20,0.05)] p-4 text-sm text-[var(--primary-dark)]">{adminError}</div>;
    }

    switch (adminView) {
      case 'nodes':
        return (
          <HandbookNodesAdminPage
            nodes={adminNodes}
            onSave={async (node) => {
              await upsertHandbookNode(node);
              await Promise.all([refreshAdminData(), refreshHomeData()]);
            }}
            onDelete={async (nodeId) => {
              await deleteHandbookNode(nodeId);
              await Promise.all([refreshAdminData(), refreshHomeData()]);
            }}
          />
        );
      case 'notices':
        return (
          <HandbookNoticesAdminPage
            notices={adminNotices}
            onSave={async (notice) => {
              await upsertHandbookNotice(notice);
              await Promise.all([refreshAdminData(), refreshHomeData()]);
            }}
            onDelete={async (noticeId) => {
              await deleteHandbookNotice(noticeId);
              await Promise.all([refreshAdminData(), refreshHomeData()]);
            }}
          />
        );
      default:
        return (
          <AdminDashboardPage
            summaries={summaries}
            notices={adminNotices}
            onOpenNodes={() => setAdminView('nodes')}
            onOpenNotices={() => setAdminView('notices')}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-transparent px-4 py-4 md:px-6 md:py-6 xl:px-8">
      <div className="mx-auto flex max-w-[1520px] flex-col gap-6 pb-24 md:pb-8">
        <HandbookTopBar
          title={getSectionTitle(activeSection)}
          onToggleMenu={() => setIsSecondaryMenuOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenNotices={() => setActiveSection('home')}
          onOpenAdmin={() => {
            if (isAdmin) {
              setIsAdminOpen(true);
              setAdminView('dashboard');
              return;
            }
            onOpenAdmin?.();
          }}
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
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">Lối vào Hệ thống dữ liệu</div>
              <div className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-[var(--primary-dark)]">Menu phụ trên mobile, mục chính trên desktop</div>
              <div className="mt-3 max-w-3xl text-sm leading-7 text-[var(--ink-soft)]">
                Theo quyết định đã chốt, <code>Hệ thống dữ liệu</code> sẽ được đưa vào menu phụ trên mobile để giữ 5 tab Sổ tay gọn và quen thuộc.
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onOpenDataSystem} className="primary-btn inline-flex items-center gap-2">
                <Database size={16} />
                Hệ thống dữ liệu
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminOpen(true);
                    setAdminView('dashboard');
                  }}
                  className="secondary-btn inline-flex items-center gap-2"
                >
                  <ShieldUser size={16} />
                  Quản trị handbook mới
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
          if (isAdmin) {
            setIsAdminOpen(true);
            setAdminView('dashboard');
          }
        }}
      />

      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-[rgba(19,15,12,0.36)] px-4 py-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="secondary-btn flex h-11 w-11 items-center justify-center !rounded-full !p-0"
                aria-label="Đóng tìm kiếm"
              >
                <X size={18} />
              </button>
            </div>

            <SearchPage
              query={searchQuery}
              onQueryChange={setSearchQuery}
              results={searchResults}
              isLoading={isSearchLoading}
              onSelectResult={handleSelectSearchResult}
            />

            {searchError ? (
              <div className="mt-4 rounded-[24px] border border-[rgba(179,15,20,0.2)] bg-[rgba(179,15,20,0.05)] px-4 py-3 text-sm text-[var(--primary-dark)]">
                {searchError}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {isAdminOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-[rgba(19,15,12,0.42)] px-4 py-6">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-white/80">Admin handbook riêng</div>
                <div className="text-2xl font-extrabold text-white">Khu quản trị cho module Sổ tay mới</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdminView('dashboard')} className="secondary-btn">Tổng quan</button>
                <button type="button" onClick={() => setAdminView('nodes')} className="secondary-btn">Nodes</button>
                <button type="button" onClick={() => setAdminView('notices')} className="secondary-btn">Thông báo</button>
                <button type="button" onClick={() => setIsAdminOpen(false)} className="secondary-btn flex h-11 w-11 items-center justify-center !rounded-full !p-0">
                  <X size={18} />
                </button>
              </div>
            </div>
            {renderAdminPanel()}
          </div>
        </div>
      )}

      <HandbookBottomNav activeSection={activeSection} onSelectSection={setActiveSection} />
    </div>
  );
}

