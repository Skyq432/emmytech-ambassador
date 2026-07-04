'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle,
  XCircle,
  Share2,
  DollarSign,
  Camera,
  Video,
  MessageSquare,
  ExternalLink,
  Search,
  Bell,
  AlertCircle,
  Gift,
  Send,
  UserPen,
  MousePointerClick,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';

type ActivityItemType =
  | 'post'
  | 'lead_created'
  | 'repeat_click'
  | 'edit_requested'
  | 'edit_approved'
  | 'edit_rejected'
  | 'conversion_created'
  | 'repeat_conversion'
  | 'notification'
  | 'bonus'
  | 'payout';

interface ActivityItem {
  id: string;
  type: ActivityItemType;
  title: string;
  description: string;
  ambassador_name?: string;
  ambassador_tag?: string;
  status?: string;
  amount?: number;
  href?: string;
  needs_attention?: boolean;
  created_at: string;
  raw?: any;
}

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Camera,
  twitter: MessageSquare,
  tiktok: Video,
  threads: MessageSquare,
  facebook: MessageSquare,
};

const typeConfig: Record<ActivityItemType, { icon: any; color: string; label: string }> = {
  post: { icon: Share2, color: 'bg-blue-100 text-blue-700', label: 'Post' },
  lead_created: { icon: MessageSquare, color: 'bg-emerald-100 text-emerald-700', label: 'Lead' },
  repeat_click: { icon: MousePointerClick, color: 'bg-slate-100 text-slate-700', label: 'Click' },
  edit_requested: { icon: Bell, color: 'bg-amber-100 text-amber-700', label: 'Needs attention' },
  edit_approved: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Approved' },
  edit_rejected: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Rejected' },
  conversion_created: { icon: DollarSign, color: 'bg-violet-100 text-violet-700', label: 'Conversion' },
  repeat_conversion: { icon: DollarSign, color: 'bg-purple-100 text-purple-700', label: 'Repeat conversion' },
  notification: { icon: AlertCircle, color: 'bg-red-100 text-red-700', label: 'Needs attention' },
  bonus: { icon: Gift, color: 'bg-emerald-100 text-emerald-700', label: 'Bonus' },
  payout: { icon: Send, color: 'bg-slate-100 text-slate-700', label: 'Payout' },
};

export default function AdminActivitiesPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingPost, setApprovingPost] = useState<string | null>(null);
  const [rejectingPost, setRejectingPost] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'posts' | 'leads' | 'conversions' | 'finance'>('all');
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchActivities();
  }, []);

  async function fetchActivities() {
    try {
      setLoading(true);
      setError(null);

      const [
        postsResponse,
        leadEventsResponse,
        notificationsResponse,
        bonusesResponse,
        payoutsResponse,
      ] = await Promise.all([
        supabase
          .from('activities')
          .select(
            `
            *,
            ambassadors(
              id,
              ambassador_tag,
              users(name)
            )
          `
          )
          .order('submitted_at', { ascending: false })
          .limit(80),
        supabase
          .from('lead_events')
          .select(
            `
            *,
            ambassadors(
              ambassador_tag,
              users(name)
            )
          `
          )
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('admin_notifications')
          .select(
            `
            *,
            ambassadors(
              ambassador_tag,
              users(name)
            )
          `
          )
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('ambassador_bonuses')
          .select(
            `
            *,
            ambassadors(
              ambassador_tag,
              users(name)
            )
          `
          )
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('payouts')
          .select(
            `
            *,
            ambassadors(
              ambassador_tag,
              users(name)
            )
          `
          )
          .order('created_at', { ascending: false })
          .limit(80),
      ]);

      if (postsResponse.error) throw postsResponse.error;
      if (leadEventsResponse.error) throw leadEventsResponse.error;
      if (notificationsResponse.error) throw notificationsResponse.error;
      if (bonusesResponse.error) throw bonusesResponse.error;
      if (payoutsResponse.error) throw payoutsResponse.error;

      const postItems: ActivityItem[] = (postsResponse.data || []).map((activity: any) => {
        const platform = activity.platform || 'post';
        const PlatformIcon = platformIcons[platform] || Share2;

        return {
          id: `post-${activity.id}`,
          type: 'post',
          title: `Post submitted on ${platform}`,
          description: activity.caption || activity.post_url || 'Social media post submitted for review.',
          ambassador_name: activity.ambassadors?.users?.name || 'Unknown',
          ambassador_tag: activity.ambassadors?.ambassador_tag || '',
          status: activity.status,
          href: activity.post_url,
          needs_attention: activity.status === 'pending_review',
          created_at: activity.submitted_at,
          raw: { ...activity, PlatformIcon },
        };
      });

      const eventItems: ActivityItem[] = (leadEventsResponse.data || []).map((event: any) => {
        const type = normalizeEventType(event.event_type);

        return {
          id: `event-${event.id}`,
          type,
          title: event.event_title || readableEventTitle(type),
          description: event.event_description || 'Lead activity recorded.',
          ambassador_name: event.ambassadors?.users?.name || 'Unknown',
          ambassador_tag: event.ambassadors?.ambassador_tag || '',
          amount:
            event.event_data?.amount ||
            event.event_data?.commission_amount ||
            null,
          href: event.lead_id ? `/admin/leads?lead=${event.lead_id}` : '/admin/leads',
          needs_attention: type === 'edit_requested',
          created_at: event.created_at,
          raw: event,
        };
      });

      const notificationItems: ActivityItem[] = (notificationsResponse.data || []).map((notification: any) => ({
        id: `notification-${notification.id}`,
        type: 'notification',
        title: notification.title,
        description: notification.message || 'Admin attention required.',
        ambassador_name: notification.ambassadors?.users?.name || 'Unknown',
        ambassador_tag: notification.ambassadors?.ambassador_tag || '',
        href: notification.lead_id ? `/admin/leads?lead=${notification.lead_id}` : '/admin/leads',
        needs_attention: !notification.is_read,
        created_at: notification.created_at,
        raw: notification,
      }));

      const bonusItems: ActivityItem[] = (bonusesResponse.data || []).map((bonus: any) => ({
        id: `bonus-${bonus.id}`,
        type: 'bonus',
        title: 'Bonus added',
        description: bonus.reason || 'Admin added ambassador bonus.',
        ambassador_name: bonus.ambassadors?.users?.name || 'Unknown',
        ambassador_tag: bonus.ambassadors?.ambassador_tag || '',
        amount: bonus.amount,
        href: `/admin/ambassadors/${bonus.ambassador_id}`,
        created_at: bonus.created_at,
        raw: bonus,
      }));

      const payoutItems: ActivityItem[] = (payoutsResponse.data || []).map((payout: any) => ({
        id: `payout-${payout.id}`,
        type: 'payout',
        title: 'Payout sent',
        description: payout.notes || 'Admin processed ambassador payout.',
        ambassador_name: payout.ambassadors?.users?.name || 'Unknown',
        ambassador_tag: payout.ambassadors?.ambassador_tag || '',
        amount: payout.amount,
        href: `/admin/ambassadors/${payout.ambassador_id}`,
        status: payout.status,
        created_at: payout.paid_at || payout.created_at,
        raw: payout,
      }));

      setItems(
        [...postItems, ...eventItems, ...notificationItems, ...bonusItems, ...payoutItems].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } catch (err: any) {
      setError(err.message || 'Unable to load activities.');
    } finally {
      setLoading(false);
    }
  }

  function normalizeEventType(type: string): ActivityItemType {
    if (type === 'lead_created') return 'lead_created';
    if (type === 'repeat_click') return 'repeat_click';
    if (type === 'edit_requested') return 'edit_requested';
    if (type === 'edit_approved') return 'edit_approved';
    if (type === 'edit_rejected') return 'edit_rejected';
    if (type === 'conversion_created') return 'conversion_created';
    if (type === 'repeat_conversion') return 'repeat_conversion';
    return 'lead_created';
  }

  function readableEventTitle(type: ActivityItemType) {
    const labels: Record<ActivityItemType, string> = {
      post: 'Post activity',
      lead_created: 'Lead created',
      repeat_click: 'Referral link clicked again',
      edit_requested: 'Lead update requested',
      edit_approved: 'Lead update approved',
      edit_rejected: 'Lead update rejected',
      conversion_created: 'Conversion added',
      repeat_conversion: 'Repeat conversion added',
      notification: 'Admin alert',
      bonus: 'Bonus added',
      payout: 'Payout sent',
    };

    return labels[type];
  }

  async function approvePost(activityId: string) {
    const rawId = activityId.replace('post-', '');
    setApprovingPost(activityId);

    try {
      const { error } = await supabase
        .from('activities')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', rawId);

      if (error) throw error;

      await fetchActivities();
    } catch (err: any) {
      alert(err.message || 'Unable to approve post.');
    } finally {
      setApprovingPost(null);
    }
  }

  async function rejectPost(activityId: string) {
    const rawId = activityId.replace('post-', '');
    const reason = window.prompt('Reason for rejection?') || 'Rejected by admin.';

    setRejectingPost(activityId);

    try {
      const { error } = await supabase
        .from('activities')
        .update({
          status: 'rejected',
          rejection_reason: reason,
        })
        .eq('id', rawId);

      if (error) throw error;

      await fetchActivities();
    } catch (err: any) {
      alert(err.message || 'Unable to reject post.');
    } finally {
      setRejectingPost(null);
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const term = search.toLowerCase();

      const matchesSearch =
        item.title.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        (item.ambassador_name || '').toLowerCase().includes(term) ||
        (item.ambassador_tag || '').toLowerCase().includes(term) ||
        (item.status || '').toLowerCase().includes(term);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'attention' && item.needs_attention) ||
        (filter === 'posts' && item.type === 'post') ||
        (filter === 'leads' && ['lead_created', 'repeat_click', 'edit_requested', 'edit_approved', 'edit_rejected'].includes(item.type)) ||
        (filter === 'conversions' && ['conversion_created', 'repeat_conversion', 'notification'].includes(item.type)) ||
        (filter === 'finance' && ['bonus', 'payout'].includes(item.type));

      return matchesSearch && matchesFilter;
    });
  }, [items, search, filter]);

  const attentionCount = items.filter((item) => item.needs_attention).length;
  const postApprovalCount = items.filter((item) => item.type === 'post' && item.status === 'pending_review').length;
  const conversionReviewCount = items.filter((item) => item.type === 'notification' && item.needs_attention).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-red-600">Error loading activities: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Activities
          </h1>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            Everything happening across leads, posts, conversions, payouts, and bonuses.
          </p>
        </div>

        {attentionCount > 0 && (
          <Button onClick={() => setFilter('attention')} className="gap-2 bg-amber-600 hover:bg-amber-700">
            <Bell className="h-4 w-4" />
            {attentionCount} needs attention
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ActivityStat title="Needs Attention" value={attentionCount} icon={Bell} alert />
        <ActivityStat title="Post Approvals" value={postApprovalCount} icon={Share2} />
        <ActivityStat title="Conversion Reviews" value={conversionReviewCount} icon={AlertCircle} danger />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search activities..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'attention', label: `Needs Attention${attentionCount ? ` (${attentionCount})` : ''}` },
            { key: 'posts', label: 'Posts' },
            { key: 'leads', label: 'Leads' },
            { key: 'conversions', label: 'Conversions' },
            { key: 'finance', label: 'Finance' },
          ].map((item) => (
            <Button
              key={item.key}
              variant={filter === item.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(item.key as any)}
              className="shrink-0"
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center">
              <Inbox className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="text-slate-500">No activity found</p>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item) => <ActivityRow
            key={item.id}
            item={item}
            approvingPost={approvingPost}
            rejectingPost={rejectingPost}
            onApprovePost={approvePost}
            onRejectPost={rejectPost}
          />)
        )}
      </div>
    </div>
  );
}

function ActivityRow({
  item,
  approvingPost,
  rejectingPost,
  onApprovePost,
  onRejectPost,
}: {
  item: ActivityItem;
  approvingPost: string | null;
  rejectingPost: string | null;
  onApprovePost: (id: string) => void;
  onRejectPost: (id: string) => void;
}) {
  const config = typeConfig[item.type];
  const Icon = config.icon;
  const isPostPending = item.type === 'post' && item.status === 'pending_review';

  return (
    <Card className={`rounded-2xl border-slate-200 shadow-sm ${item.needs_attention ? 'border-amber-200 bg-amber-50/50' : ''}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.color}`}>
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{item.title}</p>
                <Badge variant={item.needs_attention ? 'warning' : 'secondary'}>
                  {config.label}
                </Badge>
                {item.status && (
                  <Badge variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'outline'}>
                    {item.status === 'pending_review' ? 'pending' : item.status}
                  </Badge>
                )}
              </div>

              <p className="mt-1 text-sm text-slate-600">{item.description}</p>

              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                {item.ambassador_name && <span>{item.ambassador_name}</span>}
                {item.ambassador_tag && <span>• {item.ambassador_tag}</span>}
                <span>• {formatDate(item.created_at)}</span>
                {item.amount ? <span>• {formatCurrency(item.amount)}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            {item.href && (
              item.href.startsWith('http') ? (
                <a href={item.href} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Button>
                </a>
              ) : (
                <Link href={item.href}>
                  <Button size="sm" variant="outline" className="gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Button>
                </Link>
              )
            )}

            {isPostPending && (
              <>
                <Button
                  size="sm"
                  onClick={() => onApprovePost(item.id)}
                  disabled={approvingPost === item.id}
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  {approvingPost === item.id ? 'Approving...' : 'Approve'}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRejectPost(item.id)}
                  disabled={rejectingPost === item.id}
                  className="gap-1 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityStat({
  title,
  value,
  icon: Icon,
  alert = false,
  danger = false,
}: {
  title: string;
  value: number;
  icon: any;
  alert?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          danger && value > 0 ? 'bg-red-500' : alert && value > 0 ? 'bg-amber-500' : 'bg-blue-500'
        }`}>
          <Icon className="h-5 w-5 text-white" />
        </div>

        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}
