'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  CheckCircle, XCircle, Share2, Users, DollarSign,
  Camera, Video, MessageSquare, ExternalLink, ArrowLeft, ChevronRight, Search
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, POINT_VALUES } from '@/lib/utils';

interface Activity {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  ambassador_tag: string;
  platform: string;
  post_url: string | null;
  caption: string | null;
  submitted_at: string;
  status: 'pending_review' | 'approved' | 'rejected';
  points_awarded: number | null;
  rejection_reason: string | null;
}

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Camera,
  twitter: MessageSquare,
  tiktok: Video,
  threads: MessageSquare,
};

export default function ActivitiesPage() {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchPendingActivities() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('activities')
          .select('*, ambassadors(id, ambassador_tag, users(name))')
          .eq('status', 'pending_review')
          .order('submitted_at', { ascending: false });

        if (error) throw error;

        const formatted: Activity[] = (data || []).map((a: any) => ({
          id: a.id,
          ambassador_id: a.ambassador_id,
          ambassador_name: a.ambassadors?.users?.name || 'Unknown',
          ambassador_tag: a.ambassadors?.ambassador_tag || '',
          platform: a.platform,
          post_url: a.post_url,
          caption: a.caption,
          submitted_at: a.submitted_at,
          status: a.status,
          points_awarded: a.points_awarded,
          rejection_reason: a.rejection_reason,
        }));

        setItems(formatted);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPendingActivities();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('approve_activity', {
        p_activity_id: id,
        p_admin_id: session.user.id,
        p_points: POINT_VALUES.post,
      });

      if (error) throw error;
      setItems(items.filter(item => item.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('activities')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setItems(items.filter(item => item.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredItems = items.filter(item =>
    item.ambassador_name.toLowerCase().includes(search.toLowerCase()) ||
    item.platform.toLowerCase().includes(search.toLowerCase()) ||
    (item.caption?.toLowerCase().includes(search.toLowerCase()) || false)
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200/50 rounded-xl animate-pulse" />
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Admin</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-900 font-medium">Approvals</span>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">Review Queue</h1>
        <p className="text-slate-500 mt-1">Approve or reject ambassador submissions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{items.length}</p>
                <p className="text-sm text-slate-500">Pending Posts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">0</p>
                <p className="text-sm text-slate-500">Pending Signups</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">0</p>
                <p className="text-sm text-slate-500">Pending Conversions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by ambassador, platform, or caption..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 border-slate-200"
        />
      </div>

      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-12 text-center">
              <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900">All Caught Up!</h3>
              <p className="text-slate-500 mt-2">No pending approvals at the moment</p>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item) => {
            const Icon = platformIcons[item.platform.toLowerCase()] || Share2;
            return (
              <Card key={item.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-5">
                    <div className="w-14 h-14 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-slate-900 text-lg">Post Approval</span>
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Pending Review</Badge>
                      </div>

                      <p className="text-slate-700 mb-2">
                        <span className="font-semibold text-blue-600">{item.ambassador_name}</span>
                        {' '}posted on <span className="font-medium">{item.platform}</span>
                        {' '}• <span className="text-slate-500">{item.ambassador_tag}</span>
                      </p>

                      {item.caption && (
                        <div className="p-4 bg-slate-50 rounded-xl mb-3 border border-slate-100">
                          <p className="text-sm text-slate-600 italic">"{item.caption}"</p>
                        </div>
                      )}

                      {item.post_url && (
                        <a 
                          href={item.post_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 mb-3 font-medium"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Original Post
                        </a>
                      )}

                      <p className="text-xs text-slate-400">Submitted {formatDate(item.submitted_at)}</p>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      <Button 
                        size="sm" 
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={() => handleApprove(item.id)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => handleReject(item.id)}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}