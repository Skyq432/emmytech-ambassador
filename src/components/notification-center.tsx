'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { Bell, X, DollarSign, UserRoundCheck } from 'lucide-react';

interface Notification {
  id: string;
  type: 'payout' | 'previously_referred' | 'lead_credited';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setupNotifications() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data: ambassador } = await supabase
        .from('ambassadors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!ambassador || !active) return;

      const { data: storedNotifications } = await supabase
        .from('ambassador_notifications')
        .select('id, type, title, message, is_read, created_at')
        .eq('ambassador_id', ambassador.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (active && storedNotifications) {
        const items: Notification[] = storedNotifications.map((item) => ({
          id: item.id,
          type: item.type as Notification['type'],
          title: item.title,
          message: item.message,
          read: item.is_read,
          created_at: item.created_at,
        }));
        setNotifications(items);
        setUnreadCount(items.filter((item) => !item.read).length);
      }

      channel = supabase
        .channel(`ambassador-notifications:${ambassador.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payouts' },
        (payload) => {
          const newPayout = payload.new as {
            id: string;
            ambassador_id: string;
            amount: number;
            created_at: string;
          };
          if (ambassador.id === newPayout.ambassador_id) {
            const notif: Notification = {
              id: newPayout.id,
              type: 'payout',
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
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'ambassador_notifications',
            filter: `ambassador_id=eq.${ambassador.id}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              type: Notification['type'];
              title: string;
              message: string;
              is_read: boolean;
              created_at: string;
            };
            const notif: Notification = {
              id: row.id,
              type: row.type,
              title: row.title,
              message: row.message,
              read: row.is_read,
              created_at: row.created_at,
            };
            setNotifications((prev) => [notif, ...prev.filter((item) => item.id !== notif.id)]);
            if (!notif.read) setUnreadCount((prev) => prev + 1);
          }
        )
        .subscribe();
    }

    void setupNotifications();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, dismissNotification]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((item) => !item.read && item.type !== 'payout').map((item) => item.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('ambassador_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }
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
                {notif.type === 'payout' ? <DollarSign className="h-5 w-5" /> : <UserRoundCheck className="h-5 w-5" />}
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
                      {notif.type === 'payout' ? <DollarSign className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />}
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
