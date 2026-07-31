'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Shield,
  Trophy,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: 'workspace' | 'manage' | 'account';
}

const adminNav: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard, group: 'workspace' },
  { label: 'Ambassadors', href: '/admin/ambassadors', icon: Users, group: 'manage' },
  { label: 'Activities', href: '/admin/activities', icon: Activity, group: 'manage' },
  { label: 'Leads', href: '/admin/leads', icon: MessageCircle, group: 'manage' },
  { label: 'Conversions', href: '/admin/conversions', icon: BarChart3, group: 'manage' },
  { label: 'Products', href: '/admin/products', icon: Package, group: 'manage' },
  { label: 'Invite', href: '/admin/invite', icon: Link2, group: 'account' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, group: 'account' },
];

const ambassadorNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'workspace' },
  { label: 'My Leads', href: '/dashboard/leads', icon: MessageCircle, group: 'workspace' },
  { label: 'Activity', href: '/dashboard/activity', icon: Activity, group: 'workspace' },
  { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: Trophy, group: 'manage' },
  { label: 'Payouts', href: '/dashboard/payouts', icon: WalletCards, group: 'manage' },
  { label: 'Payout Account', href: '/dashboard/payout-account', icon: CreditCard, group: 'account' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, group: 'account' },
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

  useEffect(() => {
    const saved = window.localStorage.getItem('emmytech-ambassador-sidebar');
    if (saved === 'collapsed') setCollapsed(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.ambassadorSidebar = collapsed
      ? 'collapsed'
      : 'expanded';
    window.localStorage.setItem(
      'emmytech-ambassador-sidebar',
      collapsed ? 'collapsed' : 'expanded'
    );
  }, [collapsed]);

  const displayName = useMemo(
    () => user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User',
    [user]
  );

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href !== '/admin' && href !== '/dashboard') {
      return pathname.startsWith(`${href}/`);
    }
    return false;
  }

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    let previousGroup: NavItem['group'] | null = null;

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-[26px] bg-gradient-to-b from-emmy-primary to-emmy-primary-dark text-white shadow-[0_22px_55px_rgba(0,34,102,0.26)]">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <div
            className={`flex h-12 min-w-0 items-center overflow-hidden rounded-2xl bg-white px-2 shadow-sm ${
              collapsed && !isMobile ? 'w-12 justify-center' : 'flex-1'
            }`}
          >
            <img
              src="/emmytech-logo.png"
              alt="EmmyTech"
              className={`object-contain ${collapsed && !isMobile ? 'h-8 w-10' : 'h-9 w-full'}`}
            />
          </div>

          {isMobile ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {(!collapsed || isMobile) && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100/[0.85]">
              {isAdmin ? <Shield className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {isAdmin ? 'Admin workspace' : 'Ambassador workspace'}
            </div>
          </div>
        )}

        <nav className="ambassador-nav-scroll flex-1 overflow-y-auto px-3 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const showDivider = previousGroup !== null && previousGroup !== item.group;
            previousGroup = item.group;

            return (
              <div key={item.href}>
                {showDivider && <div className="mx-2 my-3 h-px bg-white/10" />}
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed && !isMobile ? item.label : undefined}
                  className={`mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-white text-emmy-primary shadow-[0_10px_26px_rgba(0,20,70,0.22)]'
                      : 'text-blue-100/[0.80] hover:bg-white/[0.08] hover:text-white'
                  } ${collapsed && !isMobile ? 'justify-center px-0' : ''}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                  {(!collapsed || isMobile) && <span>{item.label}</span>}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="m-3 mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] p-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-xs font-bold text-emmy-primary">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>

          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="truncate text-[11px] capitalize text-blue-100/[0.65]">
                {role}
              </p>
            </div>
          )}

          {(!collapsed || isMobile) && (
            <button
              onClick={handleSignOut}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-blue-100/[0.75] transition hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-[60] grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-emmy-primary shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] p-3 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu overlay"
          />
          <aside className="relative h-full w-[286px] max-w-[88vw]">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      <aside
        className={`fixed bottom-4 left-4 top-4 z-50 hidden transition-[width] duration-200 lg:block ${
          collapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
