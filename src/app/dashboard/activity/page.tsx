'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, POINT_VALUES } from '@/lib/utils';
import { Share2, Camera, MessageSquare, Video, Search, ExternalLink, Plus } from 'lucide-react';
import Link from 'next/link';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'info';

interface Activity {
  id: string;
  ambassador_id: string;
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

const platformColors: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-700',
  twitter: 'bg-blue-100 text-blue-700',
  tiktok: 'bg-black/10 text-slate-900',
  threads: 'bg-slate-100 text-slate-700',
};

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending_review' | 'rejected'>('all');

  useEffect(() => {
    async function fetchActivities() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const userId = session.user.id;

        const { data: ambassadorData, error: ambassadorError } = await supabase
          .from('ambassadors')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (ambassadorError) throw new Error('Ambassador profile not found');
        if (!ambassadorData) throw new Error('No ambassador profile found');

        const ambassadorId = ambassadorData.id;

        const { data, error } = await supabase
          .from('activities')
          .select('*')
          .eq('ambassador_id', ambassadorId)
          .order('submitted_at', { ascending: false });

        if (error) throw error;
        setActivities(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();
  }, []);

  const getStatusBadge = (status: Activity['status']) => {
    const variants: { pending_review: BadgeVariant; approved: BadgeVariant; rejected: BadgeVariant } = {
      pending_review: 'warning',
      approved: 'success',
      rejected: 'danger',
    };
    const labels: Record<Activity['status'], string> = {
      pending_review: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = 
      (activity.caption?.toLowerCase().includes(search.toLowerCase()) || false) || 
      (activity.platform?.toLowerCase().includes(search.toLowerCase()) || false);
    const matchesFilter = filter === 'all' || activity.status === filter;
    return matchesSearch && matchesFilter;
  });

  const totalPoints = activities
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + (a.points_awarded || POINT_VALUES.post), 0);

  const pendingCount = activities.filter(a => a.status === 'pending_review').length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded animate-pulse" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-4 w-full bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-3/4 bg-slate-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-600">Error loading activity: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Activity</h1>
          <p className="text-slate-500 mt-1">Track your social media posts and engagement</p>
        </div>
        <Link href="/dashboard/activity/new">
          <Button className="bg-emmy-primary hover:bg-emmy-primary-light">
            <Plus className="w-4 h-4 mr-2" />
            Submit New Post
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="emmy-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emmy-primary/10 flex items-center justify-center">
                <Share2 className="w-6 h-6 text-emmy-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{activities.length}</p>
                <p className="text-sm text-slate-500">Total Posts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="emmy-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emmy-secondary/10 flex items-center justify-center">
                <Share2 className="w-6 h-6 text-emmy-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalPoints}</p>
                <p className="text-sm text-slate-500">Points Earned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="emmy-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                <Share2 className="w-6 h-6 text-yellow-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
                <p className="text-sm text-slate-500">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'approved', 'pending_review', 'rejected'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-emmy-primary' : ''}
            >
              {f === 'pending_review' ? 'Pending' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Activities List */}
      <div className="space-y-3">
        {filteredActivities.length === 0 ? (
          <Card className="emmy-card">
            <CardContent className="p-8 text-center">
              <p className="text-slate-500">No posts found</p>
              <p className="text-sm text-slate-400 mt-1">
                {activities.length === 0 ? 'Submit your first post to start earning points!' : 'Try adjusting your search or filter'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredActivities.map((activity) => {
            const Icon = platformIcons[activity.platform.toLowerCase()] || Share2;
            const colorClass = platformColors[activity.platform.toLowerCase()] || 'bg-slate-100 text-slate-700';

            return (
              <Card key={activity.id} className="emmy-card hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 capitalize">{activity.platform}</span>
                        {getStatusBadge(activity.status)}
                        {(activity.points_awarded || 0) > 0 && (
                          <Badge variant="secondary" className="text-emmy-secondary">+{activity.points_awarded} pts</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 mb-2">{activity.caption || 'No caption'}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span>Submitted: {formatDate(activity.submitted_at)}</span>
                      </div>
                      {activity.rejection_reason && (
                        <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-2">
                          Reason: {activity.rejection_reason}
                        </p>
                      )}
                    </div>
                    {activity.post_url && (
                      <a 
                        href={activity.post_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-emmy-primary transition-colors"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    )}
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