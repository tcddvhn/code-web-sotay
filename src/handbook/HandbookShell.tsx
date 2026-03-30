import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database, ShieldUser, X } from 'lucide-react';
import { HANDBOOK_NAV_ITEMS } from './config';
import './handbookLegacySkin.css';
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
import {
  listHandbookFavorites,
  listHandbookRecentViews,
  recordHandbookSearchLog,
  recordHandbookViewLog,
  toggleHandbookFavorite,
  upsertHandbookRecentView,
} from './services/handbookEngagement';
import { submitHandbookFeedback, type HandbookFeedbackItem } from './services/handbookFeedback';
import { getHandbookUsageStats } from './services/handbookStats';
import {
  HandbookActivityCardItem,
  HandbookContentSection,
  HandbookNodeOutlineItem,
  HandbookNodeRecord,
  HandbookNoticeItem,
  HandbookSection,
  HandbookSectionSummary,
  HandbookUsageCounters,
} from './types';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { HandbookNodesAdminPage } from './admin/HandbookNodesAdminPage';
import { HandbookNoticesAdminPage } from './admin/HandbookNoticesAdminPage';
import { UserProfile } from '../types';

type HandbookAdminView = 'dashboard' | 'nodes' | 'notices';

const EMPTY_SUMMARIES: HandbookSectionSummary[] = [
  { section: 'quy-dinh', count: 0 },
  { section: 'hoi-dap', count: 0 },
  { section: 'bieu-mau', count: 0 },
  { section: 'tai-lieu', count: 0 },
];
const EMPTY_USAGE_COUNTERS: HandbookUsageCounters = {
  searchLogs: 0,
  viewLogs: 0,
  favorites: 0,
  recentViews: 0,
};
const CONTENT_SECTIONS: HandbookContentSection[] = ['quy-dinh', 'hoi-dap', 'bieu-mau', 'tai-lieu'];

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
  currentUser = null,
  onOpenDataSystem,
  onOpenAdmin,
}: {
  initialSection?: HandbookSection;
  isAdmin?: boolean;
  currentUser?: UserProfile | null;
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
  const [favorites, setFavorites] = useState<HandbookNodeRecord[]>([]);
  const [recentViews, setRecentViews] = useState<HandbookNodeRecord[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<HandbookSectionSummary[]>(EMPTY_SUMMARIES);
  const [notices, setNotices] = useState<HandbookNoticeItem[]>([]);
  const [shellError, setShellError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminNodes, setAdminNodes] = useState<HandbookNodeRecord[]>([]);
  const [adminNotices, setAdminNotices] = useState<HandbookNoticeItem[]>([]);
  const [adminFeedback, setAdminFeedback] = useState<HandbookFeedbackItem[]>([]);
  const [usageCounters, setUsageCounters] = useState<HandbookUsageCounters>(EMPTY_USAGE_COUNTERS);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
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
  const lastLoggedViewRef = useRef<string>('');

  const currentUserEmail = currentUser?.email || null;
  const currentSection = activeSection === 'home' ? null : (activeSection as HandbookContentSection);

  const refreshHomeData = async () => {
    const [summaryData, noticeData] = await Promise.all([listHandbookSectionSummaries(), listHandbookNotices(4)]);
    setSummaries(summaryData);
    setNotices(noticeData);
  };

  const refreshEngagementData = async () => {
    if (!currentUserEmail) {
      setFavorites([]);
      setRecentViews([]);
      setFavoriteIds([]);
      return;
    }

    const [favoriteData, recentData] = await Promise.all([
      listHandbookFavorites(currentUserEmail),
      listHandbookRecentViews(currentUserEmail),
    ]);
    setFavorites(favoriteData);
    setRecentViews(recentData);
    setFavoriteIds(favoriteData.map((item) => item.id));
  };

  const refreshAllSections = async () => {
    const results = await Promise.all(CONTENT_SECTIONS.map((section) => listHandbookNodesBySection(section)));
    setSectionNodes({
      'quy-dinh': results[0],
      'hoi-dap': results[1],
      'bieu-mau': results[2],
      'tai-lieu': results[3],
    });
    setSelectedNodeIds((current) => {
      const next = { ...current };
      CONTENT_SECTIONS.forEach((section, index) => {
        const nodes = results[index];
        if (next[section] && nodes.some((node) => node.id === next[section])) {
          return;
        }
        next[section] = nodes[0]?.id;
      });
      return next;
    });
  };

  const refreshAdminData = async () => {
    const [nodes, noticesData, usageData] = await Promise.all([
      listAllHandbookNodesForAdmin(),
      listHandbookNoticesForAdmin(),
      getHandbookUsageStats(),
    ]);
    setAdminNodes(nodes);
    setAdminNotices(noticesData);
    setAdminFeedback(usageData.feedback);
    setUsageCounters(usageData.counters);
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
    let cancelled = false;

    refreshEngagementData()
      .then(() => {
        if (!cancelled) {
          setEngagementError(null);
        }
      })
      .catch((error) => {
        console.error('Handbook engagement load error:', error);
        if (!cancelled) {
          setEngagementError(error instanceof Error ? error.message : 'Không thể tải dữ liệu tương tác của handbook.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserEmail]);

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
        try {
          await recordHandbookSearchLog({
            query: trimmedQuery,
            section: 'all',
            resultsCount: results.length,
            userEmail: currentUserEmail,
          });
        } catch (loggingError) {
          console.warn('Không thể ghi search log handbook:', loggingError);
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
  }, [currentUserEmail, isSearchOpen, searchQuery]);

  useEffect(() => {
    if (!currentSection) {
      return;
    }

    const selectedNodeId = selectedNodeIds[currentSection];
    if (!selectedNodeId) {
      return;
    }

    const node = sectionNodes[currentSection].find((item) => item.id === selectedNodeId);
    if (!node) {
      return;
    }

    const viewKey = `${node.section}:${node.id}`;
    if (lastLoggedViewRef.current === viewKey) {
      return;
    }
    lastLoggedViewRef.current = viewKey;

    recordHandbookViewLog({
      nodeId: node.id,
      section: node.section,
    }).catch((error) => {
      console.warn('Không thể ghi view log handbook:', error);
    });

    if (currentUserEmail) {
      upsertHandbookRecentView(currentUserEmail, node.id)
        .then(() => refreshEngagementData())
        .catch((error) => {
          console.warn('Không thể cập nhật recent views handbook:', error);
        });
    }
  }, [currentSection, currentUserEmail, sectionNodes, selectedNodeIds]);

  const activeSectionMeta = useMemo(
    () => HANDBOOK_NAV_ITEMS.find((item) => item.id === activeSection) || HANDBOOK_NAV_ITEMS[0],
    [activeSection],
  );

  const activityCards = useMemo(
    () => ({
      favorites: favorites.map<HandbookActivityCardItem>((item) => ({
        id: item.id,
        title: item.title,
        section: item.section,
        tag: item.tag,
        updatedAt: item.updatedAt,
      })),
      recentViews: recentViews.map<HandbookActivityCardItem>((item) => ({
        id: item.id,
        title: item.title,
        section: item.section,
        tag: item.tag,
        updatedAt: item.updatedAt,
      })),
    }),
    [favorites, recentViews],
  );

  const openNode = (nodeId: string, section: HandbookContentSection) => {
    setSelectedNodeIds((current) => ({
      ...current,
      [section]: nodeId,
    }));
    setActiveSection(section);
  };

  const handleToggleFavorite = async (nodeId: string) => {
    if (!currentUserEmail) {
      setEngagementError('Cần đăng nhập để sử dụng tính năng yêu thích của Sổ tay mới.');
      return;
    }

    try {
      await toggleHandbookFavorite(currentUserEmail, nodeId);
      await refreshEngagementData();
      setEngagementError(null);
    } catch (error) {
      console.error('Handbook favorite toggle error:', error);
      setEngagementError(error instanceof Error ? error.message : 'Không thể cập nhật yêu thích handbook.');
    }
  };

  const handleSubmitFeedback = async ({ content, rating }: { content: string; rating?: string | null }) => {
    if (!currentUserEmail) {
      setFeedbackStatus(null);
      setFeedbackError('Cần đăng nhập để gửi góp ý cho Sổ tay mới.');
      return false;
    }

    try {
      setIsSubmittingFeedback(true);
      setFeedbackStatus(null);
      setFeedbackError(null);
      await submitHandbookFeedback({
        kind: 'feedback',
        rating: rating || null,
        content,
        userEmail: currentUserEmail,
      });
      setFeedbackStatus('Đã gửi góp ý. Cảm ơn bạn đã giúp hoàn thiện Sổ tay mới.');
      if (isAdminOpen && isAdmin) {
        await refreshAdminData();
      }
      return true;
    } catch (error) {
      console.error('Handbook feedback submit error:', error);
      setFeedbackError(error instanceof Error ? error.message : 'Không thể gửi góp ý handbook.');
      return false;
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleSelectSearchResult = (item: HandbookNodeOutlineItem) => {
    openNode(item.id, item.section);
    setIsSearchOpen(false);
  };

  const renderSection = () => {
    if (shellError) {
      return (
        <div className="rounded-[14px] border border-[rgba(179,15,20,0.2)] bg-[rgba(179,15,20,0.05)] p-4 text-sm leading-7 text-[var(--primary-dark)]">
          {shellError}
        </div>
      );
    }

    if (activeSection === 'home') {
      return (
        <HomePage
          summaries={summaries}
          notices={notices}
          favorites={activityCards.favorites}
          recentViews={activityCards.recentViews}
          currentUserName={currentUser?.fullName || currentUser?.email || null}
          feedbackEnabled={Boolean(currentUserEmail)}
          feedbackSubmitting={isSubmittingFeedback}
          feedbackMessage={feedbackStatus}
          feedbackError={feedbackError}
          onSubmitFeedback={handleSubmitFeedback}
          onSelectSection={setActiveSection}
          onOpenNode={openNode}
          onOpenSearch={() => setIsSearchOpen(true)}
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
        <div className="rounded-[14px] border border-[var(--line)] bg-white p-4 text-sm leading-7 text-[var(--ink-soft)]">
          Đang tải dữ liệu section <strong>{activeSectionMeta.label}</strong> từ Supabase...
        </div>
      );
    }

    const sectionProps = {
      nodes: currentNodes,
      selectedNodeId: currentSelectedNodeId,
      onSelectNode: setSelectedNode,
      canFavorite: Boolean(currentUserEmail),
      isFavorite: currentSelectedNodeId ? favoriteIds.includes(currentSelectedNodeId) : false,
      onToggleFavorite: handleToggleFavorite,
    };

    switch (activeSection) {
      case 'quy-dinh':
        return <RegulationsPage {...sectionProps} />;
      case 'hoi-dap':
        return <FaqPage {...sectionProps} />;
      case 'bieu-mau':
        return <FormsPage {...sectionProps} />;
      case 'tai-lieu':
        return <DocumentsPage {...sectionProps} />;
      default:
        return null;
    }
  };

  const renderAdminPanel = () => {
    if (adminError) {
      return <div className="rounded-[16px] border border-[rgba(179,15,20,0.2)] bg-[rgba(179,15,20,0.05)] p-4 text-sm text-[var(--primary-dark)]">{adminError}</div>;
    }

    switch (adminView) {
      case 'nodes':
        return (
          <HandbookNodesAdminPage
            nodes={adminNodes}
            onSave={async (node) => {
              await upsertHandbookNode(node);
              await Promise.all([refreshAdminData(), refreshHomeData(), refreshAllSections()]);
            }}
            onDelete={async (nodeId) => {
              await deleteHandbookNode(nodeId);
              await Promise.all([refreshAdminData(), refreshHomeData(), refreshAllSections()]);
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
            feedback={adminFeedback}
            usageCounters={usageCounters}
            onOpenNodes={() => setAdminView('nodes')}
            onOpenNotices={() => setAdminView('notices')}
          />
        );
    }
  };

  return (
    <div className="handbook-legacy min-h-screen bg-[var(--surface-alt)]">
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

      <div className="mx-auto flex max-w-[1520px] gap-6 px-4 pb-24 pt-[88px] md:px-6 md:pb-8 md:pt-[98px] xl:px-8">
        <aside className="sticky top-[98px] hidden h-[calc(100vh-122px)] w-[210px] shrink-0 border border-[var(--legacy-border)] bg-[var(--legacy-bg-box)] md:block">
          <div className="flex h-full flex-col items-stretch py-3">
            {HANDBOOK_NAV_ITEMS.map((item) => {
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`mx-2 mb-2 flex min-h-[58px] items-center gap-3 px-4 py-3 text-left text-[13px] font-semibold transition ${
                    isActive ? 'bg-[var(--legacy-bg-soft)] text-[var(--legacy-primary-dark)]' : 'text-[var(--legacy-text-muted)] hover:bg-[var(--legacy-bg-hover)] hover:text-[var(--legacy-primary)]'
                  }`}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {renderSection()}

          {engagementError ? (
            <div className="mt-4 rounded-[14px] border border-[rgba(179,15,20,0.2)] bg-[rgba(179,15,20,0.05)] px-4 py-3 text-sm text-[var(--primary-dark)]">
              {engagementError}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="legacy-recent-box mt-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="legacy-recent-title !mb-2 !border-b-0 !pb-0">Quản trị handbook mới</div>
                  <div className="mt-2 text-sm leading-6 text-[var(--legacy-text-muted)]">
                    Khu quản trị này chỉ phục vụ xây mới handbook trên nền Supabase, không làm ảnh hưởng site sổ tay cũ đang hoạt động.
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
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
                </div>
              </div>
            </div>
          ) : null}
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
          <div className="mx-auto max-w-4xl pt-[58px]">
            <div className="mb-3 flex justify-end">
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
              error={searchError}
            />
          </div>
        </div>
      )}

      {isAdminOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-[rgba(19,15,12,0.42)] px-4 py-6">
          <div className="mx-auto max-w-[1500px] pt-[48px]">
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
