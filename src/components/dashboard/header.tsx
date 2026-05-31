'use client';

import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface HeaderProps {
  user: any;
  profile: any;
}

export function DashboardHeader({ user, profile }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search..." className="pl-9 bg-slate-50 border-0 focus:bg-white" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emmy-secondary rounded-full" />
        </button>
      </div>
    </header>
  );
}