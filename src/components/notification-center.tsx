'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Bell, X, DollarSign } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('payouts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payouts' },
        async (payload) => {
          const newPayout = payload.new as any;
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: amb } = await supabase
            .from('ambassadors')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (amb?.id === newPayout.ambassador_id) {
            const notif: Notification = {
              id: newPayout.id,
              title: 'Payout Received!',
              message: `You received ₦${newPayout.amount.toLocaleString()}`,
              read: false,
              created_at: newPayout.created_at,
            };
            setNotifications((prev) => [notif, ...prev]);
            setUnreadCount((prev) => prev + 1);
            setTimeout(() => dismissNotification(newPayout.id), 6000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, dismissNotification]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <>
      {/* Toast Stack */}
      <div className="fixed top-4 right-4 z-[100] space-y-3 pointer-events-none">
        {notifications.filter(n => !n.read).slice(0, 3).map((notif) => (
          <div
            key={notif.id}
            className="pointer-events-auto animate-in slide-in-from-right fade-in duration-300 ease-out relative overflow-hidden rounded-xl border shadow-lg min-w-[320px] max-w-[380px] bg-emerald-50 text-emerald-600 border-emerald-200"
          >
            <div className="absolute bottom-0 left-0 h-0.5 bg-current opacity-20 w-full">
              <div className="h-full bg-current animate-[shrink_6s_linear_forwards]" />
            </div>
            <div className="flex items-start gap-3 p-4">
              <div className="p-2 rounded-lg shrink-0 bg-white/60">
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{notif.title}</p>
                <p className="text-sm opacity-80">{notif.message}</p>
                <p className="text-xs opacity-60 mt-1">{new Date(notif.created_at).toLocaleTimeString()}</p>
              </div>
              <button onClick={() => dismissNotification(notif.id)} className="shrink-0 p-1 rounded-lg hover:bg-black/5">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bell Button */}
      <div className="relative">
        <button onClick={() => setShowPanel(!showPanel)} className="relative p-2.5 rounded-xl hover:bg-slate-100 transition-all group">
          <Bell className="h-5 w-5 text-slate-600 group-hover:text-slate-900" />
          {unreadCount > 0 && (
            <>
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-red-500 rounded-full">
                <span className="absolute inset-0 h-2.5 w-2.5 bg-red-500 rounded-full animate-ping" />
              </span>
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </>
          )}
        </button>

        {showPanel && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl border shadow-xl overflow-hidden z-50">
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold">Notifications</p>
              {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-emmy-primary hover:underline">Mark all read</button>}
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} className="flex items-start gap-3 p-4 border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => dismissNotification(notif.id)}>
                    <div className="p-1.5 rounded-lg shrink-0 mt-0.5 bg-emerald-50 text-emerald-600">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{notif.title}</p>
                      <p className="text-sm text-muted-foreground">{notif.message}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">{new Date(notif.created_at).toLocaleString()}</p>
                    </div>
                    {!notif.read && <div className="h-2 w-2 bg-emmy-primary rounded-full shrink-0 mt-2" />}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}