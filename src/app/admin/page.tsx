'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  TrendingUp,
  MessageCircle,
  Share2,
  CheckCircle,
  Clock,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  DollarSign,
  Activity,
  ChevronRight,
  Bell,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatNumber, formatCurrency } from '@/lib/utils';

interface AdminStats {
  totalAmbassadors: number;
  activeAmbassadors: number;
  pendingApprovals: number;
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  pendingLeadEdits: number;
  unreadNotifications: number;
}

interface RecentActivity {
  id: string;
  type: 'signup' | 'post' | 'conversion' | 'lead';
  ambassador_name: string;
  ambassador_tag: string;
  platform?: string;
  source?: string;
  amount?: number;
  created_at: string;
  status: string;
}

interface TopAmbassador {
  rank: number;
  name: string;
  tag: string;
  total_leads: number;
  total_conversions: number;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats>({
    totalAmbassadors: 0,
    activeAmbassadors: 0,
    pendingApprovals: 0,
    totalLeads: 0,
    totalConversions: 0,
    totalRevenue: 0,
    pendingLeadEdits: 0,
    unreadNotifications: 0,
  });

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [topAmbassadors, setTopAmbassadors] = useState<TopAmbassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAdminData() {
      try {
        const supabase = createClient();

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) throw new Error('Not authenticated');

        /*
          IMPORTANT RULE:
          - Soft deleted ambassadors have status = "deleted".
          - Admin overview should not count or rank deleted ambassadors.
          - Business history can still remain in Leads/Conversions pages,
            but this dashboard should show current operational data only.
        */

        // Fetch ambassadors excluding soft-deleted records
        const { data: ambassadorsData, error: ambassadorsError } = await supabase
          .from('ambassadors')
          .select('id, status')
          .neq('status', 'deleted');

        if (ambassadorsError) throw ambassadorsError;

        const activeCount =
          ambassadorsData?.filter((a) => a.status === 'active').length || 0;

        // Pending activities only from non-deleted ambassadors
        const { data: pendingActivities, error: pendingError } = await supabase
          .from('activities')
          .select(
            `
              id,
              status,
              ambassadors!inner (
                id,
                status
              )
            `,
            { count: 'exact' }
          )
          .eq('status', 'pending_review')
          .neq('ambassadors.status', 'deleted');

        if (pendingError) throw pendingError;

        // Pending lead edit requests from non-deleted ambassadors
        const { data: pendingLeadEdits, error: leadEditError } = await supabase
          .from('leads')
          .select(
            `
              id,
              edit_status,
              ambassadors!inner (
                id,
                status
              )
            `,
            { count: 'exact' }
          )
          .eq('edit_status', 'pending')
          .neq('ambassadors.status', 'deleted');

        if (leadEditError) throw leadEditError;

        // Admin alerts, for example repeat conversions without commission
        const { data: unreadNotifications, error: notificationError } =
          await supabase
            .from('admin_notifications')
            .select('id', { count: 'exact' })
            .eq('is_read', false);

        if (notificationError) throw notificationError;

        // Leads only from non-deleted ambassadors for dashboard summary
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select(
            `
              id,
              ambassadors!inner (
                id,
                status
              )
            `,
            { count: 'exact' }
          )
          .neq('ambassadors.status', 'deleted');

        if (leadsError) throw leadsError;

        // Conversions only from non-deleted ambassadors for dashboard summary
        const { data: conversionsData, error: conversionsError } = await supabase
          .from('conversions')
          .select(
            `
              id,
              amount,
              ambassadors!inner (
                id,
                status
              )
            `
          )
          .neq('ambassadors.status', 'deleted');

        if (conversionsError) throw conversionsError;

        const totalRevenue =
          conversionsData?.reduce((sum, conversion: any) => {
            return sum + Number(conversion.amount || 0);
          }, 0) || 0;

        setStats({
          totalAmbassadors: ambassadorsData?.length || 0,
          activeAmbassadors: activeCount,
          pendingApprovals: pendingActivities?.length || 0,
          totalLeads: leadsData?.length || 0,
          totalConversions: conversionsData?.length || 0,
          totalRevenue,
          pendingLeadEdits: pendingLeadEdits?.length || 0,
          unreadNotifications: unreadNotifications?.length || 0,
        });

        // Recent activity from non-deleted ambassadors only
        const { data: recentActivities, error: recentError } = await supabase
          .from('activities')
          .select(
            `
              id,
              platform,
              submitted_at,
              status,
              ambassadors!inner (
                ambassador_tag,
                status,
                users (
                  name
                )
              )
            `
          )
          .neq('ambassadors.status', 'deleted')
          .order('submitted_at', { ascending: false })
          .limit(5);

        if (recentError) throw recentError;

        const formattedActivity: RecentActivity[] = (recentActivities || []).map(
          (activity: any) => ({
            id: activity.id,
            type: 'post',
            ambassador_name: activity.ambassadors?.users?.name || 'Unknown',
            ambassador_tag: activity.ambassadors?.ambassador_tag || '',
            platform: activity.platform,
            created_at: activity.submitted_at,
            status: activity.status,
          })
        );

        setRecentActivity(formattedActivity);

        // Top performers should be active ambassadors only, ranked by leads then conversions
        const { data: topAmbassadorsData, error: topError } = await supabase
          .from('ambassadors')
          .select(
            `
              id,
              ambassador_tag,
              total_leads,
              total_conversions,
              status,
              users (
                name
              )
            `
          )
          .eq('status', 'active')
          .order('total_leads', { ascending: false })
          .order('total_conversions', { ascending: false })
          .limit(5);

        if (topError) throw topError;

        const formattedTop: TopAmbassador[] = (topAmbassadorsData || []).map(
          (ambassador: any, index: number) => ({
            rank: index + 1,
            name: ambassador.users?.name || 'Unknown',
            tag: ambassador.ambassador_tag,
            total_leads: ambassador.total_leads || 0,
            total_conversions: ambassador.total_conversions || 0,
          })
        );

        setTopAmbassadors(formattedTop);
      } catch (err: any) {
        setError(err.message || 'Unable to load admin dashboard.');
      } finally {
        setLoading(false);
      }
    }

    fetchAdminData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200/50" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-xl bg-slate-200/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200/50 bg-red-50/50 p-4">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  const reviewItems =
    stats.pendingApprovals + stats.pendingLeadEdits + stats.unreadNotifications;

  const statCards = [
    {
      label: 'Total Ambassadors',
      value: stats.totalAmbassadors.toString(),
      sub: `${stats.activeAmbassadors} active`,
      icon: Users,
      color: 'bg-blue-500',
      href: '/admin/ambassadors',
    },
    {
      label: 'Review Items',
      value: reviewItems.toString(),
      sub: `${stats.pendingApprovals} posts · ${stats.pendingLeadEdits} lead edits · ${stats.unreadNotifications} alerts`,
      icon: reviewItems > 0 ? Bell : Clock,
      color: reviewItems > 0 ? 'bg-amber-500' : 'bg-slate-500',
      href: stats.pendingLeadEdits > 0 || stats.unreadNotifications > 0 ? '/admin/leads' : '/admin/activities',
    },
    {
      label: 'Total Leads',
      value: formatNumber(stats.totalLeads),
      sub: 'Active ambassadors',
      icon: MessageCircle,
      color: 'bg-emerald-500',
      href: '/admin/leads',
    },
    {
      label: 'Revenue',
      value: formatCurrency(stats.totalRevenue),
      sub: `${stats.totalConversions} conversions`,
      icon: TrendingUp,
      color: 'bg-violet-500',
      href: '/admin/conversions',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>

        <div className="h-6 w-px bg-slate-200" />

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Dashboard</span>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-slate-900">Admin</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Command Center</h1>
          <p className="mt-1 text-slate-500">
            Manage ambassadors, track leads, and monitor performance.
          </p>
        </div>

        <Badge className="border-0 bg-slate-900 px-4 py-2 text-white">
          <Activity className="mr-2 h-4 w-4" />
          Administrator
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="cursor-pointer border border-slate-200 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{stat.sub}</p>
                    </div>

                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {reviewItems > 0 && (
        <Link href={stats.pendingLeadEdits > 0 || stats.unreadNotifications > 0 ? '/admin/leads' : '/admin/activities'}>
          <Card className="border border-amber-200 bg-amber-50 shadow-sm transition hover:bg-amber-100">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>

                <div>
                  <p className="font-semibold text-amber-900">
                    {reviewItems} item{reviewItems > 1 ? 's' : ''} need admin attention
                  </p>
                  <p className="text-sm text-amber-700">
                    {stats.pendingApprovals} post approval{stats.pendingApprovals !== 1 ? 's' : ''},{' '}
                    {stats.pendingLeadEdits} lead update{stats.pendingLeadEdits !== 1 ? 's' : ''},{' '}
                    {stats.unreadNotifications} alert{stats.unreadNotifications !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>

              <Button variant="outline" className="border-amber-300 bg-white text-amber-700 hover:bg-amber-50">
                Review Now
              </Button>
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="border border-slate-200 shadow-sm lg:col-span-2">
          <CardContent className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Recent Activity
              </h3>

              <Link href="/admin/activities">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-700"
                >
                  View All <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <div className="py-12 text-center">
                  <Activity className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="text-slate-500">No recent activity</p>
                </div>
              ) : (
                recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-4 rounded-lg bg-slate-50 p-4 transition-colors hover:bg-slate-100"
                  >
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                        activity.type === 'signup'
                          ? 'bg-blue-100 text-blue-700'
                          : activity.type === 'post'
                            ? 'bg-blue-500 text-white'
                            : activity.type === 'conversion'
                              ? 'bg-emerald-500 text-white'
                              : 'bg-violet-500 text-white'
                      }`}
                    >
                      {activity.type === 'signup' && (
                        <Users className="h-5 w-5" />
                      )}
                      {activity.type === 'post' && (
                        <Share2 className="h-5 w-5" />
                      )}
                      {activity.type === 'conversion' && (
                        <DollarSign className="h-5 w-5" />
                      )}
                      {activity.type === 'lead' && (
                        <MessageCircle className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {activity.type === 'signup' && 'New Ambassador Signup'}
                          {activity.type === 'post' &&
                            `Post from ${activity.ambassador_name}`}
                          {activity.type === 'conversion' &&
                            `Conversion: ${activity.ambassador_name}`}
                          {activity.type === 'lead' &&
                            `New Lead: ${activity.ambassador_name}`}
                        </span>

                        <Badge
                          variant={
                            activity.status === 'approved'
                              ? 'success'
                              : activity.status === 'pending_review'
                                ? 'warning'
                                : 'default'
                          }
                          className="text-xs"
                        >
                          {activity.status === 'pending_review'
                            ? 'Pending'
                            : activity.status}
                        </Badge>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <span>
                          {activity.platform ||
                            activity.source ||
                            activity.ambassador_tag}
                        </span>
                        <span>•</span>
                        <span>{formatDate(activity.created_at)}</span>

                        {activity.amount && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-emerald-600">
                              {formatCurrency(activity.amount)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {activity.status === 'pending_review' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Ambassadors */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <h3 className="mb-6 text-lg font-semibold text-slate-900">
              Top Performers
            </h3>

            <div className="space-y-3">
              {topAmbassadors.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="text-slate-500">No active ambassadors yet</p>
                </div>
              ) : (
                topAmbassadors.map((ambassador) => (
                  <div
                    key={`${ambassador.rank}-${ambassador.tag}`}
                    className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-50 p-4"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        ambassador.rank === 1
                          ? 'bg-amber-400 text-white'
                          : ambassador.rank === 2
                            ? 'bg-slate-400 text-white'
                            : ambassador.rank === 3
                              ? 'bg-orange-400 text-white'
                              : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {ambassador.rank}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {ambassador.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {ambassador.tag}
                      </p>
                    </div>

                    <div className="w-20 shrink-0 text-right">
                      <p className="text-sm font-bold text-blue-600">
                        {formatNumber(ambassador.total_leads)}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {formatNumber(ambassador.total_conversions)} conv.
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Link href="/admin/leaderboard">
              <Button
                variant="outline"
                className="mt-4 w-full border-slate-200 text-sm hover:bg-slate-50"
              >
                View Full Leaderboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link href="/admin/ambassadors">
          <Card className="cursor-pointer border border-slate-200 p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500">
                <Users className="h-6 w-6 text-white" />
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  Manage Ambassadors
                </h3>
                <p className="text-sm text-slate-500">
                  Add, edit, suspend, or delete ambassadors
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/admin/activities">
          <Card className="cursor-pointer border border-slate-200 p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  Review Approvals
                </h3>
                <p className="text-sm text-slate-500">
                  Approve posts and conversions
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/admin/leads">
          <Card className="cursor-pointer border border-slate-200 p-6 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">View Leads</h3>
                <p className="text-sm text-slate-500">
                  Track active ambassador leads
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
