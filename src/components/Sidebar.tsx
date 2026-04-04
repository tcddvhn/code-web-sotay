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
} from 'lucide-react';
import { AuthenticatedUser, UserProfile, ViewMode } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  onLogout: () => void;
  user: AuthenticatedUser | null;
  userProfile?: UserProfile | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobile?: boolean;
}

export function Sidebar({
  currentView,
  onViewChange,
  isAuthenticated,
  isAdmin,
  onLogout,
  user,
  userProfile,
  isCollapsed = false,
  onToggleCollapse,
  isMobile = false,
}: SidebarProps) {
  const baseMenu = [
    { id: 'DASHBOARD' as ViewMode, label: 'Dashboard', icon: LayoutDashboard },
  ];
  const menuItems = isMobile
    ? baseMenu
    : [
        ...baseMenu,
        { id: 'AI_ANALYSIS' as ViewMode, label: 'Phân tích AI', icon: Sparkles },
        ...(isAuthenticated
          ? [
              ...(isAdmin
                ? [
                    { id: 'PROJECTS' as ViewMode, label: 'Dự án', icon: FolderPlus },
                    { id: 'LEARN_FORM' as ViewMode, label: 'Biểu mẫu', icon: BrainCircuit },
                  ]
                : []),
              { id: 'IMPORT' as ViewMode, label: 'Tiếp nhận dữ liệu', icon: FileUp },
            ]
          : []),
        { id: 'REPORTS' as ViewMode, label: 'Báo cáo', icon: FileText },
        ...(isAdmin ? [{ id: 'SETTINGS' as ViewMode, label: 'Cài đặt', icon: Settings }] : []),
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
          <button
            key={item.id}
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
            </div>
          </div>
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
