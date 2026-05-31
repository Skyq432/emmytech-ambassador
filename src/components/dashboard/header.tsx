'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { NotificationCenter } from '@/components/notification-center';
import { Menu, Search, User, Bell } from 'lucide-react';

interface DashboardHeaderProps {
  user?: any;
  profile?: any;
}

export function DashboardHeader({ user, profile }: DashboardHeaderProps) {
  const [currentUser, setCurrentUser] = useState<any>(user || profile);

  useEffect(() => {
    if (!currentUser) {
      async function fetchUser() {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('users')
            .select('name, email, avatar_url, role')
            .eq('id', user.id)
            .single();
          setCurrentUser(data);
        }
      }
      fetchUser();
    }
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button className="lg:hidden p-2 rounded-lg hover:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="w-64 pl-9 pr-4 py-2 rounded-lg bg-slate-100 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emmy-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationCenter />

          <div className="flex items-center gap-3 pl-3 border-l">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{currentUser?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground capitalize">{currentUser?.role || 'Ambassador'}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-emmy-primary text-white flex items-center justify-center text-sm font-bold overflow-hidden">
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} alt="" className="h-full w-full object-cover" />
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