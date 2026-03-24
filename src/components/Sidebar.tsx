import React from 'react';
import { LayoutDashboard, FileUp, FileText, Settings, LogOut, LogIn, User as UserIcon, FolderPlus, BrainCircuit } from 'lucide-react';
import { UserProfile, ViewMode } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User } from 'firebase/auth';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  onLogout: () => void;
  user: User | null;
  userProfile?: UserProfile | null;
}

export function Sidebar({ currentView, onViewChange, isAuthenticated, isAdmin, onLogout, user, userProfile }: SidebarProps) {
  const menuItems = [
    { id: 'DASHBOARD' as ViewMode, label: 'Dashboard', icon: LayoutDashboard },
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
    <div className="sidebar-shell flex h-screen w-72 flex-col">
      <div className="border-b border-[var(--sidebar-border)] p-8">
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
            {item.label}
          </button>
        ))}
      </nav>

      <div className="space-y-4 border-t border-[var(--sidebar-border)] p-8">
        {user && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] px-3 py-3">
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
            <div className="overflow-hidden">
              <p className="truncate text-[11px] font-bold text-white">{userProfile?.displayName || user.displayName || 'User'}</p>
              <p className="truncate text-[10px] text-white/65">{user.email}</p>
            </div>
          </div>
        )}

        {user ? (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/85 transition-opacity hover:opacity-70"
          >
            <LogOut size={14} />
            Đăng xuất
          </button>
        ) : (
          <button
            onClick={() => onViewChange('LOGIN')}
            className={twMerge(
              clsx(
                'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/85 transition-opacity hover:opacity-70',
                currentView === 'LOGIN' && 'text-[var(--gold)]',
              ),
            )}
          >
            <LogIn size={14} />
            Đăng nhập
          </button>
        )}
      </div>
    </div>
  );
}

