'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle,
  XCircle,
  Share2,
  Users,
  DollarSign,
  Camera,
  Video,
  MessageSquare,
  ExternalLink,
  Search,
} from 'lucide-react';
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
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPendingActivities();
  }, []);

  async function fetchPendingActivities() {
    try {
      setLoading(true);
      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

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

  const handleApprove = async (id: string) => {
    try {
      setProcessingId(id);
      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('approve_activity', {
        p_activity_id: id,
        p_admin_id: session.user.id,
        p_points: POINT_VALUES.post,
      });

      if (error) throw error;

      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setProcessingId(id);
      const supabase = createClient();

      const { error } = await supabase
        .from('activities')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();

    return (
      item.ambassador_name.toLowerCase().includes(q) ||
      item.ambassador_tag.toLowerCase().includes(q) ||
      item.platform.toLowerCase().includes(q) ||
      (item.caption?.toLowerCase().includes(q) || false)
    );
  });

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200/60" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Review Queue
        </h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">
          Approve or reject ambassador activity submissions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Share2} title="Pending Posts" value={items.length} color="bg-blue-500" />
        <StatCard icon={Users} title="Pending Signups" value={0} color="bg-amber-500" />
        <StatCard icon={DollarSign} title="Pending Conversions" value={0} color="bg-emerald-500" />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search by ambassador, platform, or caption..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-8 text-center sm:p-12">
              <CheckCircle className="mx-auto mb-4 h-14 w-14 text-emerald-400 sm:h-16 sm:w-16" />
              <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">
                All Caught Up!
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                No pending approvals at the moment.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item) => {
            const Icon = platformIcons[item.platform.toLowerCase()] || Share2;

            return (
              <Card
                key={item.id}
                className="rounded-2xl border-slate-200 shadow-sm transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500 sm:h-14 sm:w-14">
                      <Icon className="h-6 w-6 text-white sm:h-7 sm:w-7" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900 sm:text-lg">
                          Post Approval
                        </span>

                        <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
                          Pending Review
                        </Badge>
                      </div>

                      <p className="mt-2 text-sm text-slate-700 sm:text-base">
                        <span className="font-semibold text-blue-600">
                          {item.ambassador_name}
                        </span>{' '}
                        posted on{' '}
                        <span className="font-medium capitalize">
                          {item.platform}
                        </span>{' '}
                        • <span className="text-slate-500">{item.ambassador_tag}</span>
                      </p>

                      {item.caption && (
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:p-4">
                          <p className="line-clamp-4 text-sm italic text-slate-600">
                            “{item.caption}”
                          </p>
                        </div>
                      )}

                      <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-slate-500">
                          Submitted: {formatDate(item.submitted_at)}
                        </p>

                        {item.post_url && (
                          <a
                            href={item.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700"
                          >
                            View Post
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          onClick={() => handleApprove(item.id)}
                          disabled={processingId === item.id}
                          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                        >
                          <CheckCircle className="h-4 w-4" />
                          {processingId === item.id ? 'Processing...' : `Approve +${POINT_VALUES.post} pts`}
                        </Button>

                        <Button
                          onClick={() => handleReject(item.id)}
                          disabled={processingId === item.id}
                          variant="danger"
                          className="w-full gap-2 sm:w-auto"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
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
            <Icon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
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