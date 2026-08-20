'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { NotificationCenter } from '@/components/notification-center';
import { User } from 'lucide-react';

interface DashboardHeaderProps {
  user?: any;
  profile?: any;
}

const pageMeta: Record<string, { title: string; eyebrow: string }> = {
  '/dashboard': { title: 'Dashboard', eyebrow: 'Ambassador workspace' },
  '/dashboard/leads': { title: 'My Leads', eyebrow: 'Referral pipeline' },
  '/dashboard/activity': { title: 'Activity', eyebrow: 'Social submissions' },
  '/dashboard/activity/new': { title: 'Submit Activity', eyebrow: 'Social submissions' },
  '/dashboard/leaderboard': { title: 'Leaderboard', eyebrow: 'Performance ranking' },
  '/dashboard/payouts': { title: 'Payouts', eyebrow: 'Earnings history' },
  '/dashboard/payout-account': { title: 'Payout Account', eyebrow: 'Payment details' },
  '/dashboard/settings': { title: 'Settings', eyebrow: 'Account preferences' },
};

export function DashboardHeader({ user, profile }: DashboardHeaderProps) {
  const pathname = usePathname();
  const currentUser = profile || user;

  const meta = useMemo(() => {
    if (pageMeta[pathname]) return pageMeta[pathname];
    if (pathname.startsWith('/dashboard/leads/')) {
      return { title: 'Lead Timeline', eyebrow: 'Referral customer journey' };
    }
    return { title: 'Ambassador Workspace', eyebrow: 'EmmyTech growth programme' };
  }, [pathname, currentUser?.role]);

  const displayName =
    currentUser?.name || currentUser?.user_metadata?.name || currentUser?.email || 'User';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#f6f8fc]/[0.88] backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1500px] items-center justify-between gap-4 px-4 pl-16 sm:px-6 sm:pl-16 lg:px-8 lg:pl-8">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {meta.eyebrow}
          </p>
          <h1 className="mt-1 truncate text-xl font-bold tracking-[-0.025em] text-slate-950 sm:text-[22px]">
            {meta.title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationCenter />

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-1.5 pr-2.5 shadow-sm">
            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-emmy-primary text-sm font-bold text-white">
              {currentUser?.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>

            <div className="hidden max-w-40 text-left sm:block">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-[11px] capitalize text-slate-500">
                {currentUser?.role || 'ambassador'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
