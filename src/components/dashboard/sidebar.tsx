'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import {
  LayoutDashboard, Users, Activity, MessageCircle, Trophy,
  Settings, DollarSign, Link2, BarChart3, LogOut, Shield,
  ChevronLeft, ChevronRight
} from 'lucide-react';

const adminNav = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Ambassadors', href: '/admin/ambassadors', icon: Users },
  { label: 'Activities', href: '/admin/activities', icon: Activity },
  { label: 'Leads', href: '/admin/leads', icon: MessageCircle },
  { label: 'Conversions', href: '/admin/conversions', icon: BarChart3 },
  //{ label: 'Payouts', href: '/admin/payouts', icon: DollarSign },
  { label: 'Invite', href: '/admin/invite', icon: Link2 },
  //{ label: 'Leaderboard', href: '/admin/leaderboard', icon: Trophy },
];

const ambassadorNav = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Leads', href: '/dashboard/leads', icon: MessageCircle },
  { label: 'Activity', href: '/dashboard/activity', icon: Activity },
  //{ label: 'Leaderboard', href: '/dashboard/leaderboard', icon: Trophy },
  //{ label: 'Payouts', href: '/dashboard/payouts', icon: DollarSign },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface DashboardSidebarProps {
  role?: string;
  user?: any;
}

export function DashboardSidebar({ role = 'ambassador', user }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = role === 'admin' ? adminNav : ambassadorNav;
  const isAdmin = role === 'admin';

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  // FIXED: Only highlight exact match for root routes, sub-match for nested
  function isActive(href: string): boolean {
    if (pathname === href) return true;
    // For non-root routes, allow sub-path matching
    // For root routes (/admin, /dashboard), only exact match
    if (href !== '/admin' && href !== '/dashboard') {
      return pathname.startsWith(href + '/');
    }
    return false;
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-50 h-screen bg-white border-r transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emmy-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="font-bold text-slate-900">EmmyTech</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Role Badge */}
      {!collapsed && isAdmin && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <Shield className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Admin</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                active
                  ? 'bg-emmy-primary text-white shadow-md shadow-emmy-primary/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t">
        <div className={`flex items-center gap-3 ${collapsed && 'justify-center'}`}>
          <div className="h-9 w-9 rounded-full bg-emmy-primary text-white flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              user?.name?.[0]?.toUpperCase() || 'U'
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full mt-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  );
}