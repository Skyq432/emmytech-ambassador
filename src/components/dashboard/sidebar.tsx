'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Activity,
  MessageCircle,
  Trophy,
  Settings,
  Link2,
  BarChart3,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Package,
  CreditCard,
} from 'lucide-react';

const adminNav = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Ambassadors', href: '/admin/ambassadors', icon: Users },
  { label: 'Activities', href: '/admin/activities', icon: Activity },
  { label: 'Leads', href: '/admin/leads', icon: MessageCircle },
  { label: 'Conversions', href: '/admin/conversions', icon: BarChart3 },
  { label: 'Invite', href: '/admin/invite', icon: Link2 },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
  { label: 'Products', href: '/admin/products', icon: Package },
];

const ambassadorNav = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Leads', href: '/dashboard/leads', icon: MessageCircle },
  { label: 'Activity', href: '/dashboard/activity', icon: Activity },
  { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: Trophy },
  { label: 'Payout Account', href: '/dashboard/payout-account', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface DashboardSidebarProps {
  role?: string;
  user?: any;
}

export function DashboardSidebar({
  role = 'ambassador',
  user,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = role === 'admin' ? adminNav : ambassadorNav;
  const isAdmin = role === 'admin';

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  function isActive(href: string): boolean {
    if (pathname === href) return true;

    if (href !== '/admin' && href !== '/dashboard') {
      return pathname.startsWith(href + '/');
    }

    return false;
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b p-4">
        <div
          className={`flex items-center gap-2 ${
            collapsed && !isMobile ? 'hidden' : ''
          }`}
        >
          <img
            src="/emmytech-logo.png"
            alt="EmmyTech"
            className="h-10 object-contain"
          />
        </div>

        {isMobile ? (
          <button
            onClick={closeMobile}
            className="rounded-lg p-2 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg p-1.5 hover:bg-slate-100"
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {!collapsed && !isMobile && isAdmin && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
            <Shield className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Admin
            </span>
          </div>
        </div>
      )}

      {isMobile && isAdmin && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
            <Shield className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Admin
            </span>
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMobile}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                active
                  ? 'bg-emmy-primary text-white shadow-md shadow-emmy-primary/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${
                  active ? 'text-white' : 'text-slate-400'
                }`}
              />

              {(!collapsed || isMobile) && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div
          className={`flex items-center gap-3 ${
            collapsed && !isMobile ? 'justify-center' : ''
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emmy-primary text-sm font-bold text-white">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              user?.name?.[0]?.toUpperCase() || 'U'
            )}
          </div>

          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user?.name || 'User'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
          )}
        </div>

        {(!collapsed || isMobile) && (
          <button
            onClick={handleSignOut}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-[60] rounded-xl border bg-white p-2 shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={closeMobile}
            aria-label="Close menu overlay"
          />

          <aside className="relative h-full w-72 max-w-[85vw] border-r bg-white shadow-xl">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      <aside
        className={`fixed left-0 top-0 z-50 hidden h-screen flex-col border-r bg-white transition-all duration-300 lg:flex ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent />
      </aside>
    </>
  );
}