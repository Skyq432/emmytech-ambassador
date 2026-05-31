'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, TrendingUp, MessageCircle, Share2,
  CheckCircle, Clock, ArrowLeft, ArrowUpRight,
  BarChart3, DollarSign, Activity, ChevronRight
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
  total_points: number;
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
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [topAmbassadors, setTopAmbassadors] = useState<TopAmbassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAdminData() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        // Fetch stats
        const { data: ambassadorsData } = await supabase
          .from('ambassadors')
          .select('status');

        const activeCount = ambassadorsData?.filter(a => a.status === 'active').length || 0;

        const { data: pendingActivities } = await supabase
          .from('activities')
          .select('*', { count: 'exact' })
          .eq('status', 'pending_review');

        const { data: leadsData } = await supabase
          .from('leads')
          .select('*', { count: 'exact' });

        const { data: conversionsData } = await supabase
          .from('conversions')
          .select('amount');

        const totalRevenue = conversionsData?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;

        setStats({
          totalAmbassadors: ambassadorsData?.length || 0,
          activeAmbassadors: activeCount,
          pendingApprovals: pendingActivities?.length || 0,
          totalLeads: leadsData?.length || 0,
          totalConversions: conversionsData?.length || 0,
          totalRevenue,
        });

        // Fetch recent activity
        const { data: recentActivities } = await supabase
          .from('activities')
          .select('*, ambassadors(ambassador_tag, users(name))')
          .order('submitted_at', { ascending: false })
          .limit(5);

        const formattedActivity: RecentActivity[] = (recentActivities || []).map((a: any) => ({
          id: a.id,
          type: 'post',
          ambassador_name: a.ambassadors?.users?.name || 'Unknown',
          ambassador_tag: a.ambassadors?.ambassador_tag || '',
          platform: a.platform,
          created_at: a.submitted_at,
          status: a.status,
        }));

        setRecentActivity(formattedActivity);

        // Fetch top ambassadors
        const { data: topAmbassadorsData } = await supabase
          .from('ambassadors')
          .select('*, users(name)')
          .order('total_points', { ascending: false })
          .limit(5);

        const formattedTop: TopAmbassador[] = (topAmbassadorsData || []).map((a: any, index: number) => ({
          rank: index + 1,
          name: a.users?.name || 'Unknown',
          tag: a.ambassador_tag,
          total_points: a.total_points || 0,
          total_leads: a.total_leads || 0,
          total_conversions: a.total_conversions || 0,
        }));

        setTopAmbassadors(formattedTop);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAdminData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200/50 bg-red-50/50 rounded-xl">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Ambassadors', value: stats.totalAmbassadors.toString(), sub: `${stats.activeAmbassadors} active`, icon: Users, color: 'bg-blue-500', href: '/admin/ambassadors' },
    { label: 'Pending Approvals', value: stats.pendingApprovals.toString(), sub: 'Needs review', icon: Clock, color: 'bg-amber-500', href: '/admin/activities' },
    { label: 'Total Leads', value: formatNumber(stats.totalLeads), sub: 'All time', icon: MessageCircle, color: 'bg-emerald-500', href: '/admin/leads' },
    { label: 'Revenue', value: formatCurrency(stats.totalRevenue), sub: `${stats.totalConversions} conversions`, icon: TrendingUp, color: 'bg-violet-500', href: '/admin/conversions' },
  ];

  return (
    <div className="space-y-8">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Dashboard</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-900 font-medium">Admin</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Command Center</h1>
          <p className="text-slate-500 mt-1">Manage ambassadors, track leads, and monitor performance</p>
        </div>
        <Badge className="px-4 py-2 bg-slate-900 text-white border-0">
          <Activity className="w-4 h-4 mr-2" />
          Administrator
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                      <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2 border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
              <Link href="/admin/activities">
                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                  View All <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No recent activity</p>
                </div>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activity.type === 'signup' ? 'bg-blue-100 text-blue-700' :
                      activity.type === 'post' ? 'bg-blue-500 text-white' :
                      activity.type === 'conversion' ? 'bg-emerald-500 text-white' :
                      'bg-violet-500 text-white'
                    }`}>
                      {activity.type === 'signup' && <Users className="w-5 h-5" />}
                      {activity.type === 'post' && <Share2 className="w-5 h-5" />}
                      {activity.type === 'conversion' && <DollarSign className="w-5 h-5" />}
                      {activity.type === 'lead' && <MessageCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 text-sm">
                          {activity.type === 'signup' && 'New Ambassador Signup'}
                          {activity.type === 'post' && `Post from ${activity.ambassador_name}`}
                          {activity.type === 'conversion' && `Conversion: ${activity.ambassador_name}`}
                          {activity.type === 'lead' && `New Lead: ${activity.ambassador_name}`}
                        </span>
                        <Badge variant={
                          activity.status === 'approved' ? 'success' : 
                          activity.status === 'pending_review' ? 'warning' : 
                          'default'
                        } className="text-xs">{activity.status === 'pending_review' ? 'Pending' : activity.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        <span>{activity.platform || activity.source || activity.ambassador_tag}</span>
                        <span>•</span>
                        <span>{formatDate(activity.created_at)}</span>
                        {activity.amount && <><span>•</span><span className="text-emerald-600 font-medium">{formatCurrency(activity.amount)}</span></>}
                      </div>
                    </div>
                    {activity.status === 'pending_review' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="text-emerald-600 hover:bg-emerald-50 border-emerald-200">
                          <CheckCircle className="w-4 h-4" />
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
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Top Performers</h3>
            <div className="space-y-3">
              {topAmbassadors.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No ambassadors yet</p>
                </div>
              ) : (
                topAmbassadors.map((ambassador) => (
                  <div key={ambassador.rank} className="flex items-center gap-3 p-4 rounded-lg bg-slate-50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      ambassador.rank === 1 ? 'bg-amber-400 text-white' :
                      ambassador.rank === 2 ? 'bg-slate-400 text-white' :
                      ambassador.rank === 3 ? 'bg-orange-400 text-white' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {ambassador.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{ambassador.name}</p>
                      <p className="text-xs text-slate-500">{ambassador.tag}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-600 text-sm">{formatNumber(ambassador.total_points)}</p>
                      <p className="text-xs text-slate-400">pts</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link href="/dashboard/leaderboard">
              <Button variant="outline" className="w-full mt-4 text-sm border-slate-200 hover:bg-slate-50">
                View Full Leaderboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/ambassadors">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Manage Ambassadors</h3>
                <p className="text-sm text-slate-500">Add, edit, or suspend ambassadors</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/admin/activities">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Review Approvals</h3>
                <p className="text-sm text-slate-500">Approve posts and conversions</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/admin/leads">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">View Leads</h3>
                <p className="text-sm text-slate-500">Track all ambassador leads</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}