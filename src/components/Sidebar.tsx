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
  Search,
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
  reportTreeSearchTerm?: string;
  onReportTreeSearchChange?: (value: string) => void;
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
  reportTreeSearchTerm = '',
  onReportTreeSearchChange,
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

      <nav className="flex-1 py-4">
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
              <div className="px-4 pb-4">
                <div className="rounded-[24px] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] p-4">
                  <div className="mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/65">Cây Báo Cáo</p>
                    <p className="mt-2 text-xs leading-5 text-white/72">
                      Chọn dự án và đơn vị trực tiếp trong menu để xem biểu báo cáo.
                    </p>
                  </div>

                  <div className="mb-3 flex items-center gap-2 rounded-[16px] border border-[rgba(255,255,255,0.12)] bg-white/10 px-3 py-2 text-white/80">
                    <Search size={14} />
                    <input
                      type="text"
                      value={reportTreeSearchTerm}
                      onChange={(event) => onReportTreeSearchChange?.(event.target.value)}
                      placeholder="Tìm dự án hoặc đơn vị..."
                      className="w-full bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none"
                    />
                  </div>

                  <div className="max-h-[calc(100vh-360px)] space-y-2 overflow-y-auto pr-1">
                    {reportTreeProjects.map(({ project, importedCount, pendingCount, units }) => {
                      const isExpanded = expandedReportProjectIds.includes(project.id);
                      const isProjectActive =
                        selectedReportProjectId === project.id && selectedReportUnitCode === '__TOTAL_CITY__';

                      return (
                        <div
                          key={project.id}
                          className="rounded-[18px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-2"
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleReportProject?.(project.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(255,255,255,0.14)] bg-white/10 text-white/75 transition hover:bg-white/16"
                              title={isExpanded ? 'Thu gọn dự án' : 'Mở rộng dự án'}
                            >
                              {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectReportProject?.(project.id)}
                              className={twMerge(
                                clsx(
                                  'flex min-w-0 flex-1 items-center gap-3 rounded-[14px] px-3 py-2 text-left transition',
                                  isProjectActive ? 'bg-white/16 text-white' : 'text-white/88 hover:bg-white/10',
                                ),
                              )}
                            >
                              <Building2 size={15} className="shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{project.name}</div>
                                <div className="text-[11px] text-white/58">{units.length} đơn vị</div>
                              </div>
                              <div className="shrink-0 rounded-full border border-[rgba(246,208,128,0.28)] bg-[rgba(250,225,170,0.14)] px-2 py-1 text-[10px] font-bold text-[#f6d080]">
                                {importedCount}/{units.length}
                              </div>
                              {pendingCount > 0 && (
                                <div className="shrink-0 rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,236,236,0.16)] px-2 py-1 text-[10px] font-bold text-white">
                                  {pendingCount} chờ duyệt
                                </div>
                              )}
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 space-y-1 pl-4">
                              {!isUnitUser && (
                                <button
                                  type="button"
                                  onClick={() => onSelectReportUnit?.(project.id, '__TOTAL_CITY__')}
                                  className={twMerge(
                                    clsx(
                                      'flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-sm transition',
                                      selectedReportProjectId === project.id &&
                                        selectedReportUnitCode === '__TOTAL_CITY__'
                                        ? 'bg-white/14 text-white'
                                        : 'text-white/82 hover:bg-white/10',
                                    ),
                                  )}
                                >
                                  <FileText size={14} className="shrink-0" />
                                  <span className="truncate font-medium">Đảng bộ Thành phố</span>
                                  <span className="ml-auto shrink-0 rounded-full border border-[rgba(246,208,128,0.28)] bg-[rgba(250,225,170,0.14)] px-2 py-1 text-[10px] font-bold text-[#f6d080]">
                                    {importedCount}/{units.length}
                                  </span>
                                  {pendingCount > 0 && (
                                    <span className="shrink-0 rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,236,236,0.16)] px-2 py-1 text-[10px] font-bold text-white">
                                      {pendingCount} chờ duyệt
                                    </span>
                                  )}
                                </button>
                              )}

                              {units.map((unit) => {
                                const isUnitActive =
                                  selectedReportProjectId === project.id && selectedReportUnitCode === unit.code;

                                return (
                                  <button
                                    key={`${project.id}-${unit.code}`}
                                    type="button"
                                    onClick={() => onSelectReportUnit?.(project.id, unit.code)}
                                    className={twMerge(
                                      clsx(
                                        'flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-left text-sm transition',
                                        isUnitActive ? 'bg-white/14 text-white' : 'text-white/82 hover:bg-white/10',
                                      ),
                                    )}
                                  >
                                    <span className="truncate font-medium">{unit.name}</span>
                                    <div className="ml-auto flex shrink-0 items-center gap-2">
                                      {unit.hasPendingOverwrite && (
                                        <span className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,236,236,0.16)] px-2 py-1 text-[10px] font-bold text-white">
                                          Chờ duyệt
                                        </span>
                                      )}
                                      <span
                                        className={twMerge(
                                          clsx(
                                            'rounded-full border px-2 py-1 text-[10px] font-bold',
                                            unit.hasData
                                              ? 'border-[rgba(179,214,188,0.28)] bg-[rgba(67,122,87,0.18)] text-[#d8f3de]'
                                              : 'border-[rgba(246,208,128,0.28)] bg-[rgba(250,225,170,0.14)] text-[#f6d080]',
                                          ),
                                        )}
                                      >
                                        {unit.hasData ? 'Đã có dữ liệu' : 'Chưa có dữ liệu'}
                                      </span>
                                      <span className="text-[10px] uppercase tracking-[0.16em] text-white/52">
                                        {unit.code}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {reportTreeProjects.length === 0 && (
                      <div className="rounded-[18px] border border-dashed border-[rgba(255,255,255,0.14)] px-4 py-8 text-center text-sm text-white/60">
                        Không tìm thấy dự án hoặc đơn vị phù hợp.
                      </div>
                    )}
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
