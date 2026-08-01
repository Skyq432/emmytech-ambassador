'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  GitMerge,
  Globe2,
  Link2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
  XCircle,
} from 'lucide-react';

interface LeadRecord {
  id: string;
  lead_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  source: string;
  status: string;
  approved_as_lead: boolean | null;
  lead_approval_status: string | null;
  identity_id: string | null;
  ambassador_id: string | null;
  created_at: string;
  source_detail: Record<string, unknown> | null;
  ambassadors?: {
    display_name?: string | null;
    ambassador_tag?: string | null;
    users?: { name?: string | null } | null;
  } | null;
}

interface TimelineEvent {
  event_source: string;
  event_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface EvidenceField {
  field?: string;
  value?: string | null;
  strength?: string;
  current?: string | null;
  candidate?: string | null;
}

interface MergeSuggestion {
  suggestion_id: string;
  candidate_lead_id: string | null;
  candidate_name: string;
  candidate_phone: string | null;
  candidate_email: string | null;
  candidate_ambassador: string;
  confidence: number;
  reason_summary: string;
  same_fields: EvidenceField[] | null;
  different_fields: EvidenceField[] | null;
  recommendation: string;
  impact_summary: {
    primary_lead_id?: string;
    candidate_lead_id?: string | null;
    will_keep_primary_lead?: boolean;
    will_preserve_timeline?: boolean;
    will_award_extra_lead_points?: boolean;
    will_archive_duplicate_lead?: boolean;
    merge_allowed_from_this_page?: boolean;
    ownership_warning?: string | null;
  } | null;
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

function cleanEvidence(value: EvidenceField[] | null | undefined) {
  return (value || []).filter(Boolean);
}

export default function AdminLeadTimelinePage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const supabase = createClient();

  const ambassadorName = useMemo(
    () =>
      lead?.ambassadors?.display_name ||
      lead?.ambassadors?.users?.name ||
      lead?.ambassadors?.ambassador_tag ||
      'No Ambassador',
    [lead]
  );

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function loadPage() {
    setLoading(true);
    setError(null);

    const [leadResult, timelineResult, suggestionResult] = await Promise.all([
      supabase
        .from('leads')
        .select(
          `
          id,
          lead_code,
          customer_name,
          customer_phone,
          customer_email,
          source,
          status,
          approved_as_lead,
          lead_approval_status,
          identity_id,
          ambassador_id,
          created_at,
          source_detail,
          ambassadors(
            display_name,
            ambassador_tag,
            users(name)
          )
        `
        )
        .eq('id', leadId)
        .single(),
      supabase.rpc('get_unified_lead_timeline_v3', { p_lead_id: leadId }),
      supabase.rpc('get_explained_merge_suggestions_v3', { p_lead_id: leadId }),
    ]);

    if (leadResult.error) {
      setError(leadResult.error.message);
      setLoading(false);
      return;
    }

    setLead(leadResult.data as unknown as LeadRecord);
    setTimeline((timelineResult.data || []) as TimelineEvent[]);

    if (suggestionResult.error) {
      setError(suggestionResult.error.message);
      setSuggestions([]);
    } else {
      setSuggestions((suggestionResult.data || []) as MergeSuggestion[]);
    }

    setLoading(false);
  }

  async function resolveSuggestion(
    suggestion: MergeSuggestion,
    action: 'merge' | 'keep_separate' | 'attach_activity_only'
  ) {
    const promptText =
      action === 'merge'
        ? 'Explain why these records belong to the same person.'
        : action === 'keep_separate'
          ? 'Explain why these records must remain separate.'
          : 'Explain why only the activity should be attached.';
    const note = window.prompt(promptText);

    if (note === null) return;
    if (!note.trim()) {
      setError('A reason is required for every merge decision.');
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError('Your Admin session has expired. Sign in again.');
      return;
    }

    const key = `${suggestion.suggestion_id}:${action}`;
    setResolving(key);
    setError(null);
    setSuccess(null);

    const { data, error: rpcError } = await supabase.rpc(
      'resolve_explained_merge_v3',
      {
        p_admin_id: user.id,
        p_suggestion_id: suggestion.suggestion_id,
        p_primary_lead_id: leadId,
        p_action: action,
        p_note: note.trim(),
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setResolving(null);
      return;
    }

    setSuccess(
      action === 'merge'
        ? `Records merged. ${Number(data?.reversed_points || 0)} duplicate point(s) were reversed.`
        : action === 'keep_separate'
          ? 'The identities were kept separate and the reason was saved.'
          : 'Only the possible related activity was attached. The identities remain separate.'
    );
    setResolving(null);
    await loadPage();
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
            href="/admin/leads"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emmy-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to leads
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">
            {lead.customer_name || 'Unnamed lead'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {lead.lead_code || lead.id} · {ambassadorName}
          </p>
        </div>

        <Button variant="outline" onClick={loadPage} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh timeline
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Phone" value={lead.customer_phone || 'Not provided'} />
        <InfoCard label="Email" value={lead.customer_email || 'Not provided'} />
        <InfoCard label="Source" value={lead.source} />
        <InfoCard
          label="Lead status"
          value={lead.approved_as_lead ? 'Approved lead' : lead.lead_approval_status || 'Pending'}
        />
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            Duplicate protection
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            Explained merge suggestions
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Every approval shows why the records were suggested, what matches, what differs
            and exactly what the decision will change.
          </p>
        </div>

        {suggestions.length === 0 ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="p-7 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-3 font-semibold text-slate-800">
                No pending merge suggestion
              </p>
              <p className="mt-1 text-sm text-slate-500">
                The identity engine has not found another record that currently needs review.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <Card key={suggestion.suggestion_id} className="border-slate-200 shadow-sm">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">
                          Possible match: {suggestion.candidate_name}
                        </h3>
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {suggestion.confidence}% confidence
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {suggestion.candidate_phone || 'No phone'} ·{' '}
                        {suggestion.candidate_ambassador}
                      </p>
                    </div>
                    {suggestion.candidate_lead_id && (
                      <Link
                        href={`/admin/leads/${suggestion.candidate_lead_id}`}
                        className="text-sm font-semibold text-emmy-primary hover:underline"
                      >
                        Open candidate
                      </Link>
                    )}
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <p className="font-semibold text-blue-950">Why this was suggested</p>
                    <p className="mt-1 text-sm leading-6 text-blue-800">
                      {suggestion.reason_summary}
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <EvidencePanel
                      title="What is the same"
                      fields={cleanEvidence(suggestion.same_fields)}
                      tone="same"
                    />
                    <EvidencePanel
                      title="What is different"
                      fields={cleanEvidence(suggestion.different_fields)}
                      tone="different"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Recommendation
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {suggestion.recommendation}
                      </p>
                    </div>
                    <ImpactPanel impact={suggestion.impact_summary} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => resolveSuggestion(suggestion, 'merge')}
                      disabled={
                        Boolean(resolving) ||
                        suggestion.impact_summary?.merge_allowed_from_this_page === false
                      }
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {resolving === `${suggestion.suggestion_id}:merge` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitMerge className="h-4 w-4" />
                      )}
                      {suggestion.impact_summary?.merge_allowed_from_this_page === false
                        ? 'Open credited lead first'
                        : 'Merge into this lead'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => resolveSuggestion(suggestion, 'keep_separate')}
                      disabled={Boolean(resolving)}
                      className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Keep separate
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => resolveSuggestion(suggestion, 'attach_activity_only')}
                      disabled={Boolean(resolving)}
                      className="gap-2"
                    >
                      <Link2 className="h-4 w-4" />
                      Attach activity only
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            Customer journey
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Unified timeline</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Website visits, product searches, referral clicks, Spin Wheel registration,
            WhatsApp activity and Admin decisions appear in one ordered history.
          </p>
        </div>

        {timeline.length === 0 ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="p-7 text-center text-sm text-slate-500">
              No timeline event has been recorded for this lead yet.
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
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-2 break-words font-semibold capitalize text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function EvidencePanel({
  title,
  fields,
  tone,
}: {
  title: string;
  fields: EvidenceField[];
  tone: 'same' | 'different';
}) {
  const Icon = tone === 'same' ? CheckCircle2 : AlertTriangle;
  const styles =
    tone === 'same'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
      : 'border-amber-100 bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-xl border p-4 ${styles}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="font-semibold">{title}</p>
      </div>
      {fields.length === 0 ? (
        <p className="mt-3 text-sm opacity-75">Nothing important was recorded here.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {fields.map((field, index) => (
            <div key={`${field.field}-${index}`} className="rounded-lg bg-white/75 p-3 text-sm">
              <p className="font-semibold capitalize">{field.field || 'Signal'}</p>
              <p className="mt-1 break-all text-xs leading-5 opacity-80">
                {field.value || [field.current, field.candidate].filter(Boolean).join(' → ') || 'Recorded evidence'}
              </p>
              {field.strength && (
                <p className="mt-1 text-xs font-medium capitalize opacity-70">
                  {field.strength} evidence
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactPanel({
  impact,
}: {
  impact: MergeSuggestion['impact_summary'];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-slate-500" />
        <p className="font-semibold text-slate-900">What approval will change</p>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        <li>• This page’s lead remains the primary record.</li>
        <li>• Website, WhatsApp and Spin history stays available.</li>
        <li>• No additional lead points will be awarded.</li>
        <li>• Any duplicate lead record will be archived.</li>
      </ul>
      {impact?.ownership_warning && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
          {impact.ownership_warning}
        </div>
      )}
    </div>
  );
}
