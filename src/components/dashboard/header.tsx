'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { NotificationCenter } from '@/components/notification-center';
import { Search, User } from 'lucide-react';

interface DashboardHeaderProps {
  user?: any;
  profile?: any;
}

export function DashboardHeader({ user, profile }: DashboardHeaderProps) {
  const [currentUser, setCurrentUser] = useState<any>(profile || user);

  useEffect(() => {
    if (!currentUser) {
      async function fetchUser() {
        const supabase = createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data } = await supabase
            .from('users')
            .select('name, email, avatar_url, role')
            .eq('id', user.id)
            .single();

          setCurrentUser(data || user);
        }
      }

      fetchUser();
    }
  }, [currentUser]);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 pl-16 sm:px-5 sm:pl-16 lg:px-6 lg:pl-6">
        <div className="flex min-w-0 flex-1 items-center">
          <div className="relative hidden w-full max-w-xs md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />

            <input
              type="text"
              placeholder="Search..."
              className="w-full rounded-lg border-0 bg-slate-100 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emmy-primary/20"
            />
          </div>

          <div className="min-w-0 md:hidden">
            <p className="truncate text-sm font-semibold text-slate-900">
              {currentUser?.role === 'admin' ? 'Admin Panel' : 'Dashboard'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {currentUser?.name || currentUser?.email || 'Welcome'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationCenter />

          <div className="flex items-center gap-3 border-l pl-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">
                {currentUser?.name || 'User'}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {currentUser?.role || 'Ambassador'}
              </p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-emmy-primary text-sm font-bold text-white">
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
          </div>
        </div>
      </div>
    </header>
  );
}