import React from 'react';
import { LayoutDashboard, FileUp, FileText, Settings, LogOut, LogIn, User as UserIcon, FolderPlus } from 'lucide-react';
import { ViewMode } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User } from 'firebase/auth';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  isAuthenticated: boolean;
  onLogout: () => void;
  user: User | null;
}

export function Sidebar({ currentView, onViewChange, isAuthenticated, onLogout, user }: SidebarProps) {
  const menuItems = [
    { id: 'DASHBOARD' as ViewMode, label: 'Dashboard', icon: LayoutDashboard },
    ...(isAuthenticated ? [
      { id: 'PROJECTS' as ViewMode, label: 'Dự án', icon: FolderPlus },
      { id: 'IMPORT' as ViewMode, label: 'Tiếp nhận File', icon: FileUp }
    ] : []),
    { id: 'REPORTS' as ViewMode, label: 'Báo cáo', icon: FileText },
    { id: 'SETTINGS' as ViewMode, label: 'Cài đặt', icon: Settings },
  ];

  return (
    <div className="w-64 h-screen border-r border-black flex flex-col bg-[#E4E3E0]">
      <div className="p-8 border-b border-black">
        <h1 className="text-xl font-bold tracking-tighter uppercase italic font-serif">
          Consolidation <br /> System
        </h1>
        <p className="text-[10px] uppercase tracking-widest opacity-50 mt-2">v2.0.0 / Enterprise</p>
      </div>

      <nav className="flex-1 py-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={twMerge(
              clsx(
                "w-full flex items-center gap-3 px-8 py-4 text-sm font-medium transition-all duration-200",
                currentView === item.id 
                  ? "bg-[#141414] text-[#E4E3E0]" 
                  : "hover:bg-black/5 text-[#141414]"
              )
            )}
          >
            <item.icon size={18} strokeWidth={currentView === item.id ? 2.5 : 2} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-8 border-t border-black space-y-4">
        {user && (
          <div className="flex items-center gap-3 mb-4">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-black" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center bg-white">
                <UserIcon size={14} />
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-[10px] font-bold truncate">{user.displayName || 'User'}</p>
              <p className="text-[8px] opacity-50 truncate">{user.email}</p>
            </div>
          </div>
        )}
        
        {user ? (
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold hover:opacity-50 transition-opacity"
          >
            <LogOut size={14} />
            Đăng xuất
          </button>
        ) : (
          <button 
            onClick={() => onViewChange('LOGIN')}
            className={twMerge(
              clsx(
                "flex items-center gap-2 text-xs uppercase tracking-widest font-bold hover:opacity-50 transition-opacity",
                currentView === 'LOGIN' && "text-blue-600"
              )
            )}
          >
            <LogIn size={14} />
            Đăng nhập Admin
          </button>
        )}
      </div>
    </div>
  );
}
