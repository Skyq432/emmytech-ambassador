'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, POINT_VALUES } from '@/lib/utils';

interface Activity {
  id: string;
  ambassador_id: string;
  platform: string;
  post_url: string | null;
  caption: string | null;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected';
  points_awarded: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'info';

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchActivities() {
      try {
        const supabase = createClient();

        // Get current session instead of getUser to avoid RLS recursion
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('activities')
          .select('*')
          .eq('ambassador_id', session.user.id)
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
    const variants: { pending: BadgeVariant; approved: BadgeVariant; rejected: BadgeVariant } = {
      pending: 'warning',
      approved: 'success',
      rejected: 'danger',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      instagram: '📸',
      twitter: '🐦',
      facebook: '📘',
      tiktok: '🎵',
      linkedin: '💼',
      youtube: '▶️',
      threads: '🧵',
    };
    return icons[platform.toLowerCase()] || '📱';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Activity</h1>
        <p className="text-muted-foreground">Track all your submitted posts and their status</p>
      </div>

      <div className="grid gap-4">
        {activities.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No posts submitted yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Submit your first post to start earning points!
              </p>
            </CardContent>
          </Card>
        ) : (
          activities.map((activity) => (
            <Card key={activity.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getPlatformIcon(activity.platform)}</span>
                      <span className="font-semibold capitalize">{activity.platform}</span>
                      {getStatusBadge(activity.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {activity.caption?.substring(0, 100)}
                      {activity.caption && activity.caption.length > 100 ? '...' : ''}
                    </p>
                    {activity.post_url && (
                      <a 
                        href={activity.post_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View Post →
                      </a>
                    )}
                    {activity.rejection_reason && (
                      <p className="text-sm text-red-600 bg-red-50 p-2 rounded mt-1">
                        Reason: {activity.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-emmy-secondary">
                      +{activity.points_awarded || POINT_VALUES.post} pts
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(activity.submitted_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="bg-muted">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span>Total Posts</span>
            <span className="font-semibold">{activities.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span>Total Points from Posts</span>
            <span className="font-semibold text-emmy-secondary">
              +{activities.reduce((sum, a) => sum + (a.points_awarded || POINT_VALUES.post), 0)} pts
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}