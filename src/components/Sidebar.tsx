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
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { AuthenticatedUser, ReportTreeProjectNode, UserProfile, ViewMode } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  isMobile?: boolean;
  reportTreeProjects?: ReportTreeProjectNode[];
  selectedReportProjectId?: string;
  selectedReportUnitCode?: string;
  expandedReportProjectIds?: string[];
  onToggleReportProject?: (projectId: string) => void;
  onSelectReportProject?: (projectId: string) => void;
  onSelectReportUnit?: (projectId: string, unitCode: string) => void;
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
  isMobile = false,
  reportTreeProjects = [],
  selectedReportProjectId,
  selectedReportUnitCode,
  expandedReportProjectIds = [],
  onToggleReportProject,
  onSelectReportProject,
  onSelectReportUnit,
}: SidebarProps) {
  const isUnitUser = userProfile?.role === 'unit_user';
  const isReportsTreeVisible = currentView === 'REPORTS' && !isCollapsed && !isMobile;
  const baseMenu = [{ id: 'DASHBOARD' as ViewMode, label: 'Dashboard', icon: LayoutDashboard }];

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
              ...(isAdmin ? [{ id: 'SETTINGS' as ViewMode, label: 'Cài đặt', icon: Settings }] : []),
            ]
          : []),
      ];

  return (
    <div className={`sidebar-shell flex h-screen w-72 flex-col ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
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

      <nav className="flex-1 min-h-0 overflow-hidden py-4">
        {menuItems.map((item) => (
          <div key={item.id}>
            <button
              onClick={() => onViewChange(item.id)}
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
              <div className="px-5 pb-4">
                <div className="max-h-[calc(100vh-330px)] overflow-y-auto pr-2 sidebar-report-tree">
                  <div className="space-y-1">
                    {reportTreeProjects.map(({ project, importedCount, pendingCount, units }) => {
                      const isExpanded = expandedReportProjectIds.includes(project.id);
                      const isProjectActive =
                        selectedReportProjectId === project.id && selectedReportUnitCode === '__TOTAL_CITY__';

                      return (
                        <div key={project.id}>
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleReportProject?.(project.id)}
                              className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center text-white/70 transition hover:text-white"
                              title={isExpanded ? 'Thu gọn dự án' : 'Mở rộng dự án'}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectReportProject?.(project.id)}
                              className={twMerge(
                                clsx(
                                  'group flex min-w-0 flex-1 items-start gap-2 rounded-[10px] px-2 py-1.5 text-left transition',
                                  isProjectActive ? 'bg-white/12 text-white' : 'text-white/88 hover:bg-white/8',
                                ),
                              )}
                            >
                              <Building2 size={14} className="mt-[2px] shrink-0 text-[#f6d080]" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-semibold leading-5">{project.name}</div>
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
                                        'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] transition',
                                        selectedReportProjectId === project.id &&
                                          selectedReportUnitCode === '__TOTAL_CITY__'
                                          ? 'bg-white/10 text-white'
                                          : 'text-white/78 hover:bg-white/8',
                                      ),
                                    )}
                                  >
                                    <span className="truncate leading-5">Đảng bộ Thành phố</span>
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
                                          'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 text-left text-[13px] transition',
                                          isUnitActive ? 'bg-white/10 text-white' : 'text-white/78 hover:bg-white/8',
                                        ),
                                      )}
                                    >
                                      <span className="truncate leading-5">{unit.name}</span>
                                      <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
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
                    })}
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
              <p className="truncate text-[11px] font-bold text-white">{userProfile?.displayName || user.displayName || 'User'}</p>
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
    </div>
  );
}
