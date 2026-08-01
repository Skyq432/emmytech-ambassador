'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Clock3,
  Globe2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  UserRound,
} from 'lucide-react';

interface LeadRecord {
  id: string;
  lead_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  source: string;
  status: string;
  created_at: string;
}

interface TimelineEvent {
  event_source: string;
  event_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function sourceIcon(source: string) {
  if (source === 'website') return Globe2;
  if (source === 'referral') return MousePointerClick;
  if (source === 'identity') return UserRound;
  if (source === 'lead') return MessageCircle;
  return Clock3;
}

export default function AmbassadorLeadTimelinePage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function loadPage() {
    setLoading(true);
    setError(null);

    const [leadResult, timelineResult] = await Promise.all([
      supabase
        .from('leads')
        .select('id, lead_code, customer_name, customer_phone, customer_email, source, status, created_at')
        .eq('id', leadId)
        .single(),
      supabase.rpc('get_unified_lead_timeline_v3', { p_lead_id: leadId }),
    ]);

    if (leadResult.error) {
      setError(leadResult.error.message);
      setLead(null);
    } else {
      setLead(leadResult.data as LeadRecord);
    }

    if (timelineResult.error) {
      setError(timelineResult.error.message);
      setTimeline([]);
    } else {
      setTimeline((timelineResult.data || []) as TimelineEvent[]);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-emmy-primary" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {error || 'Lead not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/leads"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emmy-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Leads
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">
            {lead.customer_name || 'Unnamed lead'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {lead.lead_code || lead.id} · {lead.customer_phone || 'Phone not provided'}
          </p>
        </div>

        <Button variant="outline" onClick={loadPage} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh timeline
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        This timeline shows the customer journey connected to your referral: website activity,
        product searches, WhatsApp clicks, Spin Wheel registration and lead updates. Internal
        Admin notes and identity-review evidence are not shown here.
      </div>

      {timeline.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No timeline activity has been recorded for this lead yet.
          </CardContent>
        </Card>
      ) : (
        <div className="relative space-y-3 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-slate-200">
          {timeline.map((event, index) => {
            const Icon = sourceIcon(event.event_source);
            return (
              <div key={`${event.event_source}-${event.created_at}-${index}`} className="relative flex gap-4">
                <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-emmy-primary shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
                <Card className="min-w-0 flex-1 border-slate-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{event.title}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {event.event_source}
                          </span>
                        </div>
                        {event.description && (
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-xs text-slate-400">
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
