'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Link2,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  XCircle,
} from 'lucide-react';

interface WhatsAppClick {
  referral_click_id: string;
  clicked_at: string;
  visitor_id: string | null;
  ambassador_id: string | null;
  ambassador_name: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  source_page: string | null;
  product_id: string | null;
  search_query: string | null;
  needs_number: boolean;
}

interface MatchField {
  field?: string;
  value?: string | null;
  strength?: string;
  entered?: string | null;
  candidate?: string | null;
  clicked?: string | null;
  current?: string | null;
}

interface MatchSuggestion {
  lead_id: string;
  identity_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  ambassador_name: string;
  score: number;
  confidence_label: string;
  reason_summary: string;
  same_fields: MatchField[] | null;
  different_fields: MatchField[] | null;
  recommendation: string;
  last_activity_at: string;
}

function cleanFields(fields: MatchField[] | null | undefined) {
  return (fields || []).filter(Boolean);
}

function shortReference(id: string) {
  return `WA-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function confidenceClasses(label: string) {
  if (label === 'Very strong' || label === 'Strong') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (label === 'Medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function WhatsAppIntakePage() {
  const [clicks, setClicks] = useState<WhatsAppClick[]>([]);
  const [selectedClickId, setSelectedClickId] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const supabase = createClient();

  const selectedClick = useMemo(
    () => clicks.find((click) => click.referral_click_id === selectedClickId) || null,
    [clicks, selectedClickId]
  );

  useEffect(() => {
    loadClicks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedClickId) {
      setPhone('');
      setReason('');
      setSuggestions([]);
      return;
    }

    const selected = clicks.find(
      (click) => click.referral_click_id === selectedClickId
    );
    const knownPhone = selected?.lead_phone || '';

    setPhone(knownPhone);
    setReason('');
    findSuggestions(selectedClickId, knownPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClickId, clicks]);

  async function loadClicks() {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      'get_recent_whatsapp_clicks_v3',
      { p_limit: 60 }
    );

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as WhatsAppClick[];
    setClicks(rows);
    setSelectedClickId((current) =>
      rows.some((click) => click.referral_click_id === current)
        ? current
        : rows[0]?.referral_click_id || ''
    );
    setLoading(false);
  }

  async function findSuggestions(clickId = selectedClickId, enteredPhone = phone) {
    if (!clickId) return;

    setSearching(true);
    setError(null);
    setSuccess(null);

    const { data, error: rpcError } = await supabase.rpc(
      'get_whatsapp_match_suggestions_v3',
      {
        p_referral_click_id: clickId,
        p_phone: enteredPhone.trim() || null,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSuggestions([]);
    } else {
      setSuggestions((data || []) as MatchSuggestion[]);
    }

    setSearching(false);
  }

  async function resolveIntake(
    action: 'attach_existing' | 'create_new' | 'keep_separate' | 'attach_activity_only',
    targetLeadId: string | null,
    suggestion?: MatchSuggestion
  ) {
    if (!selectedClick) return;

    if (!phone.trim()) {
      setError('Enter the WhatsApp sender’s phone number before resolving this click.');
      return;
    }

    if (!reason.trim()) {
      setError('Write a short reason for the decision so the audit trail is clear.');
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

    const actionKey = `${action}:${targetLeadId || 'new'}`;
    setResolving(actionKey);
    setError(null);
    setSuccess(null);

    const snapshot = suggestion
      ? {
          candidate_lead_id: suggestion.lead_id,
          score: suggestion.score,
          confidence: suggestion.confidence_label,
          reason: suggestion.reason_summary,
          same: suggestion.same_fields,
          different: suggestion.different_fields,
          recommendation: suggestion.recommendation,
        }
      : {
          candidates_shown: suggestions.length,
          selected_action: action,
        };

    const { data, error: rpcError } = await supabase.rpc(
      'resolve_whatsapp_intake_v3',
      {
        p_admin_id: user.id,
        p_referral_click_id: selectedClick.referral_click_id,
        p_phone: phone.trim(),
        p_action: action,
        p_target_lead_id: targetLeadId,
        p_reason: reason.trim(),
        p_match_snapshot: snapshot,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setResolving(null);
      return;
    }

    setSuccess(
      data?.new_lead_credit
        ? 'WhatsApp number confirmed. One new lead and 100 points were added.'
        : action === 'keep_separate'
          ? 'The person was confirmed as a separate lead without duplicate points.'
          : action === 'create_new'
            ? 'The WhatsApp number was confirmed on this lead without duplicate points.'
            : 'WhatsApp activity was attached without creating a duplicate lead or extra points.'
    );
    setResolving(null);
    setPhone('');
    setReason('');
    setSuggestions([]);
    await loadClicks();
  }

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-emmy-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Identity workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            WhatsApp Intake
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Confirm the sender’s number, compare suggested existing leads and attach the
            conversation without counting one person twice.
          </p>
        </div>

        <Button variant="outline" onClick={loadClicks} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh clicks
        </Button>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Matching rule</p>
            <p className="mt-1 leading-6 text-blue-800">
              Exact phone, email, identity or visitor ID are strong evidence. Device and
              timing support a suggestion. An IP address alone can never merge people.
            </p>
          </div>
        </div>
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

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b border-slate-100 p-4">
              <p className="font-semibold text-slate-900">Recent WhatsApp clicks</p>
              <p className="mt-1 text-xs text-slate-500">
                Select the click that matches the incoming message reference or time.
              </p>
            </div>

            <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
              {clicks.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No WhatsApp referral clicks have been recorded yet.
                </div>
              ) : (
                clicks.map((click) => {
                  const active = click.referral_click_id === selectedClickId;
                  return (
                    <button
                      key={click.referral_click_id}
                      type="button"
                      onClick={() => setSelectedClickId(click.referral_click_id)}
                      className={`w-full p-4 text-left transition ${
                        active ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {shortReference(click.referral_click_id)}
                          </p>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {click.lead_name || 'Unknown WhatsApp visitor'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                            click.needs_number
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {click.needs_number ? 'Needs number' : 'Number known'}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        <p>{click.ambassador_name}</p>
                        <p>{formatTime(click.clicked_at)}</p>
                        {click.search_query && <p>Searched: {click.search_query}</p>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {!selectedClick ? (
            <Card className="border-slate-200">
              <CardContent className="p-8 text-center text-slate-500">
                Select a WhatsApp click to begin.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Selected click
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-slate-950">
                        {shortReference(selectedClick.referral_click_id)}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedClick.ambassador_name} · {formatTime(selectedClick.clicked_at)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Visitor: {selectedClick.visitor_id || 'Not available'}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-800">
                        WhatsApp sender’s phone number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="0801 234 5678"
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => findSuggestions()}
                      disabled={searching}
                      className="mt-auto gap-2"
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      Check matches
                    </Button>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Reason for the final decision
                    </label>
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Example: Customer confirmed the same phone and product enquiry."
                      className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emmy-primary focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => resolveIntake('create_new', null)}
                      disabled={Boolean(resolving)}
                      className="gap-2"
                    >
                      {resolving === 'create_new:new' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                      Confirm as lead
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => resolveIntake('keep_separate', null)}
                      disabled={Boolean(resolving)}
                      className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Keep separate
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-950">Suggested existing leads</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Suggestions are always shown from the available phone, visitor,
                      device, IP, Ambassador and timing signals.
                    </p>
                  </div>
                  {searching && <Loader2 className="h-5 w-5 animate-spin text-emmy-primary" />}
                </div>

                {suggestions.length === 0 && !searching ? (
                  <Card className="border-dashed border-slate-300">
                    <CardContent className="p-7 text-center">
                      <Sparkles className="mx-auto h-7 w-7 text-slate-400" />
                      <p className="mt-3 font-semibold text-slate-800">
                        No useful existing match found
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Enter the sender’s number for an exact check. You can then confirm
                        a new lead, but the system will block a duplicate phone number.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {suggestions.map((suggestion) => {
                      const same = cleanFields(suggestion.same_fields);
                      const different = cleanFields(suggestion.different_fields);
                      return (
                        <Card key={suggestion.lead_id} className="border-slate-200 shadow-sm">
                          <CardContent className="space-y-5 p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-bold text-slate-950">
                                    {suggestion.customer_name}
                                  </h3>
                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${confidenceClasses(
                                      suggestion.confidence_label
                                    )}`}
                                  >
                                    {suggestion.confidence_label} · {suggestion.score}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-slate-500">
                                  {suggestion.customer_phone || 'Phone unknown'} ·{' '}
                                  {suggestion.ambassador_name}
                                </p>
                              </div>
                              <p className="text-xs text-slate-400">
                                Last activity {formatTime(suggestion.last_activity_at)}
                              </p>
                            </div>

                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                              <p className="text-sm font-semibold text-blue-950">Why suggested</p>
                              <p className="mt-1 text-sm leading-6 text-blue-800">
                                {suggestion.reason_summary}
                              </p>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <EvidenceList
                                title="What is the same"
                                icon="same"
                                fields={same}
                                empty="No strong matching field was found."
                              />
                              <EvidenceList
                                title="What is different"
                                icon="different"
                                fields={different}
                                empty="No important difference was found."
                              />
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Recommendation
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-700">
                                {suggestion.recommendation}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() =>
                                  resolveIntake(
                                    'attach_existing',
                                    suggestion.lead_id,
                                    suggestion
                                  )
                                }
                                disabled={Boolean(resolving)}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                              >
                                {resolving === `attach_existing:${suggestion.lead_id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserRoundCheck className="h-4 w-4" />
                                )}
                                Attach to this lead
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  resolveIntake(
                                    'attach_activity_only',
                                    suggestion.lead_id,
                                    suggestion
                                  )
                                }
                                disabled={Boolean(resolving)}
                                className="gap-2"
                              >
                                <Link2 className="h-4 w-4" />
                                Attach activity only
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceList({
  title,
  fields,
  empty,
  icon,
}: {
  title: string;
  fields: MatchField[];
  empty: string;
  icon: 'same' | 'different';
}) {
  const Icon = icon === 'same' ? CheckCircle2 : AlertTriangle;
  const styles =
    icon === 'same'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
      : 'border-amber-100 bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {fields.length === 0 ? (
        <p className="mt-2 text-xs opacity-75">{empty}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {fields.map((field, index) => (
            <div key={`${field.field}-${index}`} className="rounded-lg bg-white/70 p-2 text-xs">
              <p className="font-semibold capitalize">{field.field || 'Signal'}</p>
              <p className="mt-0.5 break-all opacity-80">
                {field.value ||
                  [field.entered, field.candidate, field.clicked, field.current]
                    .filter(Boolean)
                    .join(' → ') ||
                  'Recorded match'}
              </p>
              {field.strength && (
                <p className="mt-1 font-medium capitalize opacity-70">
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
