import React from 'react';
import {
  LayoutDashboard,
  FileUp,
  FileText,
  Sparkles,
  Settings,
  LogOut,
  LogIn,
  User as UserIcon,
  FolderPlus,
  BrainCircuit,
  FileSpreadsheet,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Building2,
  Search,
  X,
} from 'lucide-react';
import { AuthenticatedUser, ReportTreeProjectNode, UserProfile, ViewMode } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getReadableDisplayName } from '../utils/textEncoding';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  onLogout: () => void;
  onOpenChangePassword: () => void;
  user: AuthenticatedUser | null;
  userProfile?: UserProfile | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  sidebarWidth?: number;
  onSidebarWidthChange?: (width: number) => void;
  isMobile?: boolean;
  reportTreeProjects?: ReportTreeProjectNode[];
  selectedReportProjectId?: string;
  selectedReportUnitCode?: string;
  expandedReportProjectIds?: string[];
  onToggleReportProject?: (projectId: string) => void;
  onCollapseAllReportProjects?: () => void;
  onSelectReportProject?: (projectId: string) => void;
  onSelectReportUnit?: (projectId: string, unitCode: string) => void;
  reportTreeSearchTerm?: string;
  onReportTreeSearchTermChange?: (value: string) => void;
}

export function Sidebar({
  currentView,
  onViewChange,
  isAuthenticated,
  isAdmin,
  onLogout,
  onOpenChangePassword,
  user,
  userProfile,
  isCollapsed = false,
  onToggleCollapse,
  sidebarWidth = 288,
  onSidebarWidthChange,
  isMobile = false,
  reportTreeProjects = [],
  selectedReportProjectId,
  selectedReportUnitCode,
  expandedReportProjectIds = [],
  onToggleReportProject,
  onCollapseAllReportProjects,
  onSelectReportProject,
  onSelectReportUnit,
  reportTreeSearchTerm = '',
  onReportTreeSearchTermChange,
}: SidebarProps) {
  const normalizeSearchText = React.useCallback((value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLocaleLowerCase('vi-VN')
      .trim();
  }, []);
  const buildSearchIndex = React.useCallback((value: string) => {
    const originalChars = Array.from(value);
    let normalized = '';
    const indexMap: number[] = [];

    originalChars.forEach((char, index) => {
      const folded = char
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .toLocaleLowerCase('vi-VN');

      Array.from(folded).forEach((foldedChar) => {
        normalized += foldedChar;
        indexMap.push(index);
      });
    });

    return { originalChars, normalized, indexMap };
  }, []);
  const normalizedReportTreeSearchTerm = normalizeSearchText(reportTreeSearchTerm);
  const renderHighlightedText = React.useCallback(
    (value: string) => {
      if (!normalizedReportTreeSearchTerm) {
        return value;
      }

      const { originalChars, normalized, indexMap } = buildSearchIndex(value);
      const matchStart = normalized.indexOf(normalizedReportTreeSearchTerm);
      if (matchStart < 0) {
        return value;
      }

      const matchEnd = matchStart + normalizedReportTreeSearchTerm.length - 1;
      const originalStart = indexMap[matchStart];
      const originalEnd = indexMap[matchEnd];
      if (originalStart === undefined || originalEnd === undefined) {
        return value;
      }

      const before = originalChars.slice(0, originalStart).join('');
      const matched = originalChars.slice(originalStart, originalEnd + 1).join('');
      const after = originalChars.slice(originalEnd + 1).join('');

      return (
        <>
          {before}
          <mark className="rounded bg-[#f6d080]/25 px-[2px] text-white">{matched}</mark>
          {after}
        </>
      );
    },
    [buildSearchIndex, normalizedReportTreeSearchTerm],
  );
  const isUnitUser = userProfile?.role === 'unit_user';
  const isReportsTreeVisible = currentView === 'REPORTS' && !isCollapsed && !isMobile;
  const baseMenu = [{ id: 'DASHBOARD' as ViewMode, label: 'Dashboard', icon: LayoutDashboard }];
  const firstMatchedProjectRef = React.useRef<HTMLDivElement | null>(null);

  const visibleReportTreeProjects = React.useMemo(() => {
    if (!normalizedReportTreeSearchTerm) {
      return reportTreeProjects;
    }

    const filterUnit = (unit: ReportTreeProjectNode['units'][number]) =>
      normalizeSearchText(unit.name).includes(normalizedReportTreeSearchTerm) ||
      normalizeSearchText(unit.code).includes(normalizedReportTreeSearchTerm);

    if (selectedReportProjectId) {
      return reportTreeProjects
        .filter(({ project }) => project.id === selectedReportProjectId)
        .map((node) => ({
          ...node,
          units: node.units.filter(filterUnit),
        }))
        .filter(({ units }) => units.length > 0);
    }

    return reportTreeProjects
      .map((node) => ({
        ...node,
        units: node.units.filter(filterUnit),
      }))
      .filter(({ units }) => units.length > 0);
  }, [normalizeSearchText, normalizedReportTreeSearchTerm, reportTreeProjects, selectedReportProjectId]);

  React.useEffect(() => {
    if (!normalizedReportTreeSearchTerm) {
      return;
    }

    firstMatchedProjectRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [normalizedReportTreeSearchTerm, visibleReportTreeProjects]);

  const menuItems = isMobile
    ? baseMenu
    : [
        ...baseMenu,
        ...(isAuthenticated
          ? [
              ...(isAdmin
                ? [
                    { id: 'AI_ANALYSIS' as ViewMode, label: 'Phân tích AI', icon: Sparkles },
                    { id: 'PROJECTS' as ViewMode, label: 'Dự án', icon: FolderPlus },
                    { id: 'LEARN_FORM' as ViewMode, label: 'Biểu mẫu', icon: BrainCircuit },
                  ]
                : []),
              { id: 'IMPORT' as ViewMode, label: 'Tiếp nhận dữ liệu', icon: FileUp },
              { id: 'REPORTS' as ViewMode, label: 'Báo cáo', icon: FileText },
              ...(!isUnitUser ? [{ id: 'EXTRACT_REPORTS' as ViewMode, label: 'Trích báo cáo', icon: FileSpreadsheet }] : []),
              ...(isAdmin ? [{ id: 'SETTINGS' as ViewMode, label: 'Cài đặt', icon: Settings }] : []),
            ]
          : []),
      ];

  const beginResize = (startX: number) => {
    if (!onSidebarWidthChange || isCollapsed || isMobile) {
      return;
    }

    const startWidth = sidebarWidth;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = Math.max(280, Math.min(520, startWidth + (event.clientX - startX)));
      onSidebarWidthChange(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      className={`sidebar-shell relative flex h-screen flex-col ${isCollapsed ? 'sidebar-collapsed' : ''}`}
      style={!isCollapsed ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : undefined}
    >
      <div className="border-b border-[var(--sidebar-border)] p-8 relative">
        {onToggleCollapse && !isMobile && (
          <button
            onClick={onToggleCollapse}
            className="sidebar-toggle-btn absolute right-4 top-6 flex items-center justify-center rounded-full border border-[rgba(255,255,255,0.25)] bg-white/10 p-2 text-white/80"
            title={isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        )}
        <h1 className="sidebar-title">
          HỆ THỐNG QUẢN TRỊ <br /> DỮ LIỆU TCĐ, ĐV TẬP TRUNG
        </h1>
        <p className="sidebar-meta mt-3 text-[10px] uppercase tracking-[0.24em]">v2.0.0 / Enterprise</p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto py-4">
        {menuItems.map((item) => (
          <div key={item.id}>
            <button
              onClick={() => onViewChange(item.id)}
              onDoubleClick={item.id === 'REPORTS' ? onCollapseAllReportProjects : undefined}
              className={twMerge(
                clsx(
                  'sidebar-item w-full flex items-center gap-3 px-8 py-4 text-sm font-medium transition-all duration-200',
                  currentView === item.id ? 'sidebar-item-active' : '',
                ),
              )}
            >
              <item.icon size={18} strokeWidth={currentView === item.id ? 2.5 : 2} />
              <span className="sidebar-label">{item.label}</span>
            </button>

            {item.id === 'REPORTS' && isReportsTreeVisible && (
              <div className="px-3 pb-4">
                <div className="mb-3 px-1">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                    Tìm kiếm
                  </div>
                  <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.28)] pb-2">
                    <Search size={14} className="shrink-0 text-white/45" />
                    <input
                      type="text"
                      value={reportTreeSearchTerm}
                      onChange={(event) => onReportTreeSearchTermChange?.(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && reportTreeSearchTerm) {
                          onReportTreeSearchTermChange?.('');
                        }
                      }}
                      placeholder="Tìm đơn vị..."
                      className="w-full bg-transparent text-[13px] text-white/88 placeholder:text-white/38 focus:outline-none"
                    />
                    {reportTreeSearchTerm ? (
                      <button
                        type="button"
                        onClick={() => onReportTreeSearchTermChange?.('')}
                        className="shrink-0 text-white/45 transition hover:text-white"
                        title="Xóa tìm kiếm"
                        aria-label="Xóa tìm kiếm"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[calc(100vh-300px)] overflow-y-auto pr-1 sidebar-report-tree">
                  <div className="space-y-1">
                    {visibleReportTreeProjects.length === 0 && normalizedReportTreeSearchTerm ? (
                      <div className="px-1 py-2 text-[12px] text-white/60">Không tìm thấy đơn vị phù hợp.</div>
                    ) : (
                      visibleReportTreeProjects.map(({ project, importedCount, pendingCount, units }, index) => {
                      const isExpanded = normalizedReportTreeSearchTerm
                        ? true
                        : expandedReportProjectIds.includes(project.id);
                      const isProjectActive =
                        selectedReportProjectId === project.id && selectedReportUnitCode === '__TOTAL_CITY__';

                      return (
                        <div
                          key={project.id}
                          ref={index === 0 && normalizedReportTreeSearchTerm ? firstMatchedProjectRef : null}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleReportProject?.(project.id)}
                              className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center text-white/70 transition hover:text-white"
                              title={isExpanded ? 'Thu gọn dự án' : 'Mở rộng dự án'}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectReportProject?.(project.id)}
                              className={twMerge(
                                clsx(
                                  'group flex min-w-0 flex-1 items-start gap-2 px-1 py-1 text-left transition',
                                  isProjectActive
                                    ? 'text-white'
                                    : 'text-white/88 hover:text-white',
                                ),
                              )}
                            >
                              <Building2 size={14} className="mt-[2px] shrink-0 text-[#f6d080]" />
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-[13px] font-semibold leading-5">{project.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/52">
                                  <span>{units.length} đơn vị</span>
                                  <span>{importedCount}/{units.length}</span>
                                  {pendingCount > 0 && <span>{pendingCount} chờ duyệt</span>}
                                </div>
                              </div>
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="ml-[10px] mt-1 border-l border-[rgba(255,255,255,0.12)] pl-4">
                              {!isUnitUser && (
                                <div className="flex items-start gap-2">
                                  <span className="mt-[7px] h-[6px] w-[6px] rounded-full bg-[#f6d080]" />
                                  <button
                                    type="button"
                                    onClick={() => onSelectReportUnit?.(project.id, '__TOTAL_CITY__')}
                                    className={twMerge(
                                      clsx(
                                        'flex min-w-0 flex-1 items-center justify-between gap-2 px-1 py-1 text-left text-[13px] transition',
                                        selectedReportProjectId === project.id &&
                                          selectedReportUnitCode === '__TOTAL_CITY__'
                                          ? 'text-white'
                                          : 'text-white/78 hover:text-white',
                                      ),
                                    )}
                                  >
                                    <span className="break-words leading-5">Đảng bộ Thành phố</span>
                                    <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[#f6d080]">
                                      {importedCount}/{units.length}
                                    </span>
                                  </button>
                                </div>
                              )}

                              {units.map((unit) => {
                                const isUnitActive =
                                  selectedReportProjectId === project.id && selectedReportUnitCode === unit.code;

                                return (
                                  <div key={`${project.id}-${unit.code}`} className="mt-1 flex items-start gap-2">
                                    <span className="mt-[7px] h-[6px] w-[6px] rounded-full bg-white/35" />
                                    <button
                                      type="button"
                                      onClick={() => onSelectReportUnit?.(project.id, unit.code)}
                                      className={twMerge(
                                        clsx(
                                          'flex min-w-0 flex-1 items-center justify-between gap-2 px-1 py-1 text-left text-[13px] transition',
                                          isUnitActive ? 'text-white' : 'text-white/78 hover:text-white',
                                        ),
                                      )}
                                    >
                                      <span className="break-words leading-5">{renderHighlightedText(unit.name)}</span>
                                      <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
                                        {normalizedReportTreeSearchTerm && normalizeSearchText(unit.code).includes(normalizedReportTreeSearchTerm) && (
                                          <span className="text-white/76 normal-case tracking-normal">{renderHighlightedText(unit.code)}</span>
                                        )}
                                        {unit.hasPendingOverwrite && <span className="text-white/76">Chờ duyệt</span>}
                                        <span className={unit.hasData ? 'text-[#d8f3de]' : 'text-[#f6d080]'}>
                                          {unit.hasData ? 'Đã có dữ liệu' : 'Chưa có dữ liệu'}
                                        </span>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer space-y-4 border-t border-[var(--sidebar-border)] p-8">
        {user && (
          <div className="sidebar-account mb-4 flex items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] px-3 py-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="Avatar"
                className="h-10 w-10 rounded-full border border-[rgba(255,255,255,0.18)]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,0.18)] bg-white/15">
                <UserIcon size={14} />
              </div>
            )}
            <div className="overflow-hidden sidebar-user-info">
              <p className="truncate text-[11px] font-bold text-white">{getReadableDisplayName(userProfile?.displayName, user.displayName, 'User')}</p>
              <p className="truncate text-[10px] text-white/65">{user.email}</p>
              {isUnitUser && userProfile?.unitName && (
                <p className="truncate text-[10px] text-white/65">{userProfile.unitName}</p>
              )}
            </div>
          </div>
        )}

        {user && (
          <button
            onClick={onOpenChangePassword}
            className="sidebar-auth-btn flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/85 transition-opacity hover:opacity-70"
          >
            <Settings size={14} />
            <span className="sidebar-auth-label">Đổi mật khẩu</span>
          </button>
        )}

        {user ? (
          <button
            onClick={onLogout}
            className="sidebar-auth-btn flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/85 transition-opacity hover:opacity-70"
          >
            <LogOut size={14} />
            <span className="sidebar-auth-label">Đăng xuất</span>
          </button>
        ) : (
          <button
            onClick={() => onViewChange('LOGIN')}
            className={twMerge(
              clsx(
                'sidebar-auth-btn flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/85 transition-opacity hover:opacity-70',
                currentView === 'LOGIN' && 'text-[var(--gold)]',
              ),
            )}
          >
            <LogIn size={14} />
            <span className="sidebar-auth-label">Đăng nhập</span>
          </button>
        )}
      </div>

      {!isMobile && !isCollapsed && onSidebarWidthChange && (
        <button
          type="button"
          className="sidebar-resize-handle"
          onPointerDown={(event) => {
            event.preventDefault();
            beginResize(event.clientX);
          }}
          aria-label="Thay đổi độ rộng menu"
          title="Kéo để thay đổi độ rộng menu"
        />
      )}
    </div>
  );
}
