'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, Users, MessageCircle, Award, 
  Copy, CheckCircle, Share2, Plus, ArrowRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

interface AmbassadorData {
  id: string;
  name: string;
  ambassador_tag: string;
  referral_code: string;
  whatsapp_link: string;
  total_points: number;
  total_leads: number;
  total_conversions: number;
  status: string;
}

interface Activity {
  id: string;
  platform: string;
  caption: string;
  status: string;
  points_awarded: number;
  submitted_at: string;
}

export default function AmbassadorDashboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get ambassador data
      const { data: ambData } = await supabase
        .from('ambassadors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (ambData) {
        setAmbassador(ambData);
      }

      // Get recent activities
      const { data: actData } = await supabase
        .from('activities')
        .select('*')
        .eq('ambassador_id', ambData?.id)
        .order('submitted_at', { ascending: false })
        .limit(5);

      if (actData) {
        setActivities(actData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emmy-primary"></div>
      </div>
    );
  }

  if (!ambassador) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No ambassador data found. Please contact admin.</p>
      </div>
    );
  }

  const stats = [
    { label: 'Total Points', value: ambassador.total_points.toLocaleString(), icon: Award, color: 'bg-emmy-primary/10 text-emmy-primary', trend: 'Lifetime points' },
    { label: 'Total Leads', value: ambassador.total_leads.toString(), icon: Users, color: 'bg-emmy-secondary/10 text-emmy-secondary', trend: 'All time' },
    { label: 'Conversions', value: ambassador.total_conversions.toString(), icon: TrendingUp, color: 'bg-green-100 text-green-700', trend: 'Completed sales' },
    { label: 'Status', value: ambassador.status.charAt(0).toUpperCase() + ambassador.status.slice(1), icon: MessageCircle, color: 'bg-purple-100 text-purple-700', trend: 'Account status' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, <span className="text-emmy-primary">{ambassador.name}</span>!</h1>
          <p className="text-slate-500 mt-1">Here is what is happening with your ambassador activity</p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">Active Ambassador</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="emmy-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{stat.trend}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="emmy-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emmy-primary" />
              Your Referral Assets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ambassador Tag</label>
              <div className="flex items-center justify-between mt-2">
                <code className="text-lg font-bold text-emmy-primary">{ambassador.ambassador_tag}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(ambassador.ambassador_tag, 'tag')} className="text-emmy-primary">
                  {copied === 'tag' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Use this hashtag in your social media posts</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Referral Code</label>
              <div className="flex items-center justify-between mt-2">
                <code className="text-lg font-bold text-emmy-secondary">{ambassador.referral_code}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(ambassador.referral_code, 'code')} className="text-emmy-secondary">
                  {copied === 'code' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Share this code with potential customers</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">WhatsApp Link</label>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-slate-700 truncate max-w-[200px]">{ambassador.whatsapp_link}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(ambassador.whatsapp_link, 'link')} className="text-emmy-primary">
                  {copied === 'link' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Direct link for WhatsApp leads</p>
            </div>
          </CardContent>
        </Card>

        <Card className="emmy-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-emmy-secondary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/activity/new">
              <Button className="w-full justify-between bg-emmy-primary hover:bg-emmy-primary-light">
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Submit New Post</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/dashboard/activity">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2"><Share2 className="w-4 h-4" /> View My Activity</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/dashboard/leads">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> View My Leads</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/dashboard/leaderboard">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2"><Award className="w-4 h-4" /> View Leaderboard</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="emmy-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <Link href="/dashboard/activity">
            <Button variant="ghost" size="sm" className="text-emmy-primary">View All</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">No activity yet. Submit your first post!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activity.status === 'approved' ? 'bg-emmy-primary/10 text-emmy-primary' : 'bg-emmy-secondary/10 text-emmy-secondary'
                  }`}>
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">New Post Submitted</span>
                      <Badge variant={
                        activity.status === 'approved' ? 'success' : 
                        activity.status === 'pending_review' ? 'warning' : 'default'
                      } className="text-xs">{activity.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{activity.caption}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>{activity.platform}</span>
                      <span>•</span>
                      <span>{new Date(activity.submitted_at).toLocaleDateString()}</span>
                      {activity.points_awarded > 0 && <><span>•</span><span className="text-emmy-secondary font-medium">+{activity.points_awarded} pts</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}