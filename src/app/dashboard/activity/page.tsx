'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, POINT_VALUES } from '@/lib/utils';
import {
  Share2,
  Camera,
  MessageSquare,
  Video,
  Search,
  ExternalLink,
  Plus,
  Clock,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline'
  | 'info';

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
  const [filter, setFilter] = useState<
    'all' | 'approved' | 'pending_review' | 'rejected'
  >('all');

  useEffect(() => {
    async function fetchActivities() {
      try {
        const supabase = createClient();

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) throw new Error('Not authenticated');

        const { data: ambassadorData, error: ambassadorError } = await supabase
          .from('ambassadors')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (ambassadorError) throw new Error('Ambassador profile not found');
        if (!ambassadorData) throw new Error('No ambassador profile found');

        const { data, error } = await supabase
          .from('activities')
          .select('*')
          .eq('ambassador_id', ambassadorData.id)
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
    const variants: {
      pending_review: BadgeVariant;
      approved: BadgeVariant;
      rejected: BadgeVariant;
    } = {
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

  const filteredActivities = activities.filter((activity) => {
    const q = search.toLowerCase();

    const matchesSearch =
      activity.caption?.toLowerCase().includes(q) ||
      activity.platform?.toLowerCase().includes(q) ||
      activity.post_url?.toLowerCase().includes(q);

    const matchesFilter = filter === 'all' || activity.status === filter;

    return matchesSearch && matchesFilter;
  });

  const totalPoints = activities
    .filter((a) => a.status === 'approved')
    .reduce((sum, a) => sum + (a.points_awarded || POINT_VALUES.post), 0);

  const pendingCount = activities.filter(
    (a) => a.status === 'pending_review'
  ).length;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>

        {[1, 2, 3].map((i) => (
          <Card key={i} className="rounded-2xl">
            <CardContent className="p-5">
              <div className="mb-2 h-4 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">Error loading activity: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            My Activity
          </h1>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            Track your social media posts and engagement.
          </p>
        </div>

        <Link href="/dashboard/activity/new" className="w-full sm:w-auto">
          <Button className="w-full gap-2 bg-emmy-primary hover:bg-emmy-primary-light sm:w-auto">
            <Plus className="h-4 w-4" />
            Submit New Post
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Share2}
          title="Total Posts"
          value={activities.length}
          color="bg-emmy-primary/10 text-emmy-primary"
        />

        <StatCard
          icon={CheckCircle}
          title="Points Earned"
          value={totalPoints}
          color="bg-emmy-secondary/10 text-emmy-secondary"
        />

        <StatCard
          icon={Clock}
          title="Pending Review"
          value={pendingCount}
          color="bg-yellow-100 text-yellow-700"
        />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <Input
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'approved', 'pending_review', 'rejected'] as const).map(
            (f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
                className={`shrink-0 ${
                  filter === f ? 'bg-emmy-primary' : ''
                }`}
              >
                {f === 'pending_review'
                  ? 'Pending'
                  : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            )
          )}
        </div>
      </div>

      <div className="space-y-3">
        {filteredActivities.length === 0 ? (
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <p className="text-slate-500">No posts found</p>
              <p className="mt-1 text-sm text-slate-400">
                {activities.length === 0
                  ? 'Submit your first post to start earning points.'
                  : 'Try adjusting your search or filter.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredActivities.map((activity) => {
            const platform = activity.platform.toLowerCase();
            const Icon = platformIcons[platform] || Share2;
            const colorClass =
              platformColors[platform] || 'bg-slate-100 text-slate-700';

            return (
              <Card
                key={activity.id}
                className="rounded-2xl border-slate-200 transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex gap-3 sm:gap-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${colorClass}`}
                    >
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold capitalize text-slate-900">
                          {activity.platform}
                        </span>

                        {getStatusBadge(activity.status)}

                        {(activity.points_awarded || 0) > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-emmy-secondary"
                          >
                            +{activity.points_awarded} pts
                          </Badge>
                        )}
                      </div>

                      <p className="mt-2 line-clamp-3 text-sm text-slate-700">
                        {activity.caption || 'No caption'}
                      </p>

                      <div className="mt-2 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                        <span>Submitted: {formatDate(activity.submitted_at)}</span>

                        {activity.post_url && (
                          <a
                            href={activity.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emmy-primary hover:underline"
                          >
                            View Post
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      {activity.rejection_reason && (
                        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                          Reason: {activity.rejection_reason}
                        </p>
                      )}
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

function StatCard({
  icon: Icon,
  title,
  value,
  color,
}: {
  icon: any;
  title: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${color}`}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>

          <div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}