'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EmmytechLogo } from '@/components/ui/logo';
import {
  LayoutDashboard, Share2, MessageCircle, Trophy, Settings,
  LogOut, Users, CheckCircle, BarChart3, Shield
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  role: string;
  user: any;
}

const ambassadorLinks = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/activity', label: 'My Activity', icon: Share2 },
  { href: '/dashboard/leads', label: 'My Leads', icon: MessageCircle },
  { href: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

const adminLinks = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/ambassadors', label: 'Ambassadors', icon: Users },
  { href: '/admin/activities', label: 'Activities', icon: CheckCircle },
  { href: '/admin/leads', label: 'Leads', icon: MessageCircle },
  { href: '/admin/conversions', label: 'Conversions', icon: BarChart3 },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function DashboardSidebar({ role, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const links = role === 'admin' ? adminLinks : ambassadorLinks;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/admin') {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 flex flex-col z-50">
      <div className="p-6 border-b border-slate-100">
        <Link href={role === 'admin' ? '/admin' : '/dashboard'}>
          <EmmytechLogo size={36} />
        </Link>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 px-2">
          <Shield className="w-4 h-4 text-emmy-secondary" />
          <span className="text-xs font-semibold text-emmy-secondary uppercase tracking-wider">
            {role}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`sidebar-link ${active ? 'active' : ''}`}
            >
              <Icon className="w-5 h-5" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-emmy-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-emmy-primary">
              {user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}