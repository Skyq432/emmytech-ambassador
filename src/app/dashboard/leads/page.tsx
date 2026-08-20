'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';
import { ReportingPeriodPanel } from '@/components/reporting/reporting-period-panel';
import {
  Phone,
  User,
  Pencil,
  X,
  AlertCircle,
  History,
  ShieldCheck,
  UserRoundX,
  Plus,
  Send,
} from 'lucide-react';

interface Lead {
  id: string;
  ambassador_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: 'new' | 'pending' | 'contacted' | 'converted' | 'lost';
  edit_status: 'none' | 'pending' | 'approved' | 'rejected' | null;
  pending_customer_name: string | null;
  pending_customer_phone: string | null;
  created_at: string;
  updated_at: string | null;
  merged_into_lead_id?: string | null;
  source: string | null;
  lead_type: string | null;
  source_detail: Record<string, unknown> | null;
  lead_approval_status: 'pending' | 'approved' | 'rejected' | 'merged' | null;
  approved_as_lead: boolean | null;
  needs_merge_review: boolean | null;
}

interface ReferralAttempt {
  id: string;
  person_label: string | null;
  status: 'pending_identity' | 'credited' | 'previously_referred' | 'failed';
  match_reason: string | null;
  attempt_count: number;
  referral_code: string;
  first_seen_at: string;
  last_seen_at: string;
  lead_id: string | null;
}

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline'
  | 'info';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [referralAttempts, setReferralAttempts] = useState<ReferralAttempt[]>([]);
  const [ambassadorId, setAmbassadorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showSubmitLead, setShowSubmitLead] = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [submitName, setSubmitName] = useState('');
  const [submitPhone, setSubmitPhone] = useState('');
  const [submitEmail, setSubmitEmail] = useState('');
  const [submitInterest, setSubmitInterest] = useState('');
  const [submitNotes, setSubmitNotes] = useState('');
  const [submissionKey, setSubmissionKey] = useState('');

  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    awaiting: 0,
    rejected: 0,
  });

  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const { range } = useReportingPeriod();

  useEffect(() => {
    fetchLeads();
  }, [range.startIso, range.endExclusiveIso]);

  async function fetchLeads() {
    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error('Not authenticated');
      }

      const { data: ambassador, error: ambassadorError } = await supabase
        .from('ambassadors')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (ambassadorError) throw ambassadorError;
      if (!ambassador) throw new Error('Ambassador profile not found.');

      setAmbassadorId(ambassador.id);

      const [leadsResponse, attemptsResponse] = await Promise.all([
        supabase
          .from('leads')
          .select(
            `
          id,
          ambassador_id,
          customer_name,
          customer_phone,
          status,
          edit_status,
          pending_customer_name,
          pending_customer_phone,
          created_at,
          updated_at,
          merged_into_lead_id,
          source,
          lead_type,
          source_detail,
          lead_approval_status,
          approved_as_lead,
          needs_merge_review
        `
          )
          .eq('ambassador_id', ambassador.id)
          .is('merged_into_lead_id', null)
          .gte('created_at', range.startIso)
          .lt('created_at', range.endExclusiveIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('ambassador_referral_attempts')
          .select(
            'id, person_label, status, match_reason, attempt_count, referral_code, first_seen_at, last_seen_at, lead_id'
          )
          .eq('attempted_ambassador_id', ambassador.id)
          .gte('first_seen_at', range.startIso)
          .lt('first_seen_at', range.endExclusiveIso)
          .order('last_seen_at', { ascending: false }),
      ]);

      if (leadsResponse.error) throw leadsResponse.error;
      if (attemptsResponse.error) throw attemptsResponse.error;

      const leadRows = leadsResponse.data || [];
      const attemptRows = (attemptsResponse.data || []) as ReferralAttempt[];

      setLeads(leadRows);
      setReferralAttempts(attemptRows);

      setStats({
        total: leadRows.length,
        approved: leadRows.filter((lead) => lead.approved_as_lead === true).length,
        awaiting: leadRows.filter((lead) => lead.lead_approval_status === 'pending').length,
        rejected: leadRows.filter((lead) => lead.lead_approval_status === 'rejected').length,
      });
    } catch (err: any) {
      setError(err.message || 'Unable to load leads.');
    } finally {
      setLoading(false);
    }
  }

  function openSubmitLead() {
    setSubmissionKey(crypto.randomUUID());
    setShowSubmitLead(true);
    setMessage(null);
  }

  function closeSubmitLead() {
    if (submittingLead) return;
    setShowSubmitLead(false);
  }

  async function submitNewLead() {
    if (!submitName.trim() || !submitPhone.trim()) {
      setMessage('Customer name and phone number are required.');
      return;
    }

    setSubmittingLead(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('submit_ambassador_lead', {
        p_customer_name: submitName.trim(),
        p_customer_phone: submitPhone.trim(),
        p_customer_email: submitEmail.trim() || null,
        p_interest: submitInterest.trim() || null,
        p_notes: submitNotes.trim() || null,
        p_submission_key: submissionKey,
      });

      if (error) throw error;

      const result = data as {
        possible_duplicate?: boolean;
        duplicate_submission?: boolean;
      } | null;

      setMessage(
        result?.possible_duplicate
          ? 'Lead submitted for Admin review. A possible existing-customer match was flagged for investigation.'
          : result?.duplicate_submission
            ? 'This submission was already received and remains in the approval queue.'
            : 'Lead submitted successfully and is awaiting Admin approval.'
      );
      setSubmitName('');
      setSubmitPhone('');
      setSubmitEmail('');
      setSubmitInterest('');
      setSubmitNotes('');
      setShowSubmitLead(false);
      await fetchLeads();
    } catch (err: any) {
      setMessage(err.message || 'Unable to submit the lead.');
    } finally {
      setSubmittingLead(false);
    }
  }

  function openEditModal(lead: Lead) {
    setEditingLead(lead);
    setEditName(lead.pending_customer_name || lead.customer_name || '');
    setEditPhone(
      lead.pending_customer_phone ||
        (lead.customer_phone === 'Not provided' ? '' : lead.customer_phone || '')
    );
    setMessage(null);
  }

  function closeEditModal() {
    setEditingLead(null);
    setEditName('');
    setEditPhone('');
  }

  async function submitLeadEditRequest() {
    if (!editingLead || !ambassadorId) return;

    if (!editName.trim() && !editPhone.trim()) {
      setMessage('Please enter at least a name or phone number.');
      return;
    }

    setSavingEdit(true);
    setMessage(null);

    try {
      const supabase = createClient();

      const { error } = await supabase.rpc('request_lead_edit', {
        p_lead_id: editingLead.id,
        p_ambassador_id: ambassadorId,
        p_customer_name: editName.trim() || null,
        p_customer_phone: editPhone.trim() || null,
      });

      if (error) throw error;

      setMessage('Lead update submitted. Admin approval is required.');
      closeEditModal();
      await fetchLeads();
    } catch (err: any) {
      setMessage(err.message || 'Unable to submit update request.');
    } finally {
      setSavingEdit(false);
    }
  }

  function getStatusBadge(status: Lead['status']) {
    const variants: Record<Lead['status'], BadgeVariant> = {
      new: 'warning',
      pending: 'warning',
      contacted: 'info',
      converted: 'success',
      lost: 'danger',
    };

    return (
      <Badge variant={variants[status]}>
        {status === 'new' ? 'new lead' : status}
      </Badge>
    );
  }

  function getEditBadge(status: Lead['edit_status']) {
    if (!status || status === 'none') return null;

    const variants: Record<string, BadgeVariant> = {
      pending: 'warning',
      approved: 'success',
      rejected: 'danger',
    };

    return <Badge variant={variants[status] || 'secondary'}>edit {status}</Badge>;
  }

  function getApprovalBadge(lead: Lead) {
    if (lead.approved_as_lead) return <Badge variant="success">approved</Badge>;
    if (lead.lead_approval_status === 'rejected') {
      return <Badge variant="danger">not approved</Badge>;
    }
    return <Badge variant="warning">awaiting approval</Badge>;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
        {[1, 2, 3].map((item) => (
          <Card key={item}>
            <CardContent className="p-6">
              <div className="h-20 animate-pulse rounded bg-slate-200" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-600">Error loading leads: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportingPeriodPanel audience="ambassador" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Leads</h1>
          <p className="text-muted-foreground">
            Submit customer leads and follow their Admin approval status.
          </p>
        </div>
        <Button onClick={openSubmitLead} className="gap-2">
          <Plus className="h-4 w-4" /> Submit Lead
        </Button>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Submitted Leads" value={String(stats.total)} />
        <StatCard label="Approved" value={String(stats.approved)} accent="text-emerald-600" />
        <StatCard label="Awaiting Approval" value={String(stats.awaiting)} accent="text-yellow-600" />
        <StatCard label="Not Approved" value={String(stats.rejected)} accent="text-red-600" />
      </div>

      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Referral activity</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every identified Spin Wheel referral is recorded. Only permanent first-touch leads receive credit.
              </p>
            </div>
            <div className="flex gap-5 text-sm">
              <div><span className="font-bold text-emerald-700">{referralAttempts.filter((item) => item.status === 'credited').length}</span> credited</div>
              <div><span className="font-bold text-amber-700">{referralAttempts.filter((item) => item.status === 'previously_referred').length}</span> previously referred</div>
              <div><span className="font-bold text-slate-700">{referralAttempts.filter((item) => item.status === 'pending_identity').length}</span> pending</div>
            </div>
          </div>

          {referralAttempts.length > 0 && (
            <div className="mt-4 divide-y divide-blue-100 overflow-hidden rounded-xl border border-blue-100 bg-white">
              {referralAttempts.map((attempt) => (
                <div key={attempt.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-full p-2 ${attempt.status === 'credited' ? 'bg-emerald-50 text-emerald-700' : attempt.status === 'previously_referred' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {attempt.status === 'credited' ? <ShieldCheck className="h-4 w-4" /> : <UserRoundX className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{attempt.person_label || 'Pending identification'}</p>
                      <p className="text-xs text-muted-foreground">
                        Code {attempt.referral_code} · {attempt.attempt_count} {attempt.attempt_count === 1 ? 'attempt' : 'attempts'} · Last seen {formatDate(attempt.last_seen_at)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={attempt.status === 'credited' ? 'success' : attempt.status === 'previously_referred' ? 'warning' : attempt.status === 'failed' ? 'danger' : 'secondary'}>
                    {attempt.status === 'credited' ? 'credited lead' : attempt.status === 'previously_referred' ? 'previously referred — not credited' : attempt.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {leads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No leads yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Share your WhatsApp or Spin Wheel referral link to start receiving leads.
              </p>
            </CardContent>
          </Card>
        ) : (
          leads.map((lead) => (
            <Card key={lead.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emmy-primary/10">
                      <User className="h-5 w-5 text-emmy-primary" />
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-slate-900">
                          {lead.customer_name || 'Anonymous Lead'}
                        </p>
                        {getStatusBadge(lead.status)}
                        {getApprovalBadge(lead)}
                        {lead.needs_merge_review && (
                          <Badge variant="warning">possible duplicate</Badge>
                        )}
                        {(lead.lead_type === 'spin_wheel_registration' ||
                          lead.source_detail?.channel === 'spin_wheel') && (
                          <Badge variant="info">Spin Wheel</Badge>
                        )}
                        {getEditBadge(lead.edit_status)}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {lead.customer_phone && lead.customer_phone !== 'Not provided' ? (
                          <a
                            href={`tel:${lead.customer_phone}`}
                            className="hover:text-emmy-primary"
                          >
                            {lead.customer_phone}
                          </a>
                        ) : (
                          <span>Phone not yet provided</span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Added {formatDate(lead.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emmy-primary/25 hover:bg-blue-50/60 hover:text-emmy-primary"
                    >
                      <History className="h-4 w-4" />
                      View timeline
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 sm:w-auto"
                      disabled={lead.edit_status === 'pending'}
                      onClick={() => openEditModal(lead)}
                    >
                      <Pencil className="h-4 w-4" />
                      Update Lead
                    </Button>
                  </div>
                </div>

                {lead.edit_status === 'pending' && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    <div className="flex gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">Update awaiting admin approval</p>
                        <p>
                          Name:{' '}
                          <strong>
                            {lead.pending_customer_name || 'Not provided'}
                          </strong>
                        </p>
                        <p>
                          Phone:{' '}
                          <strong>
                            {lead.pending_customer_phone || 'Not provided'}
                          </strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md rounded-2xl">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Update Lead</h2>
                  <p className="text-sm text-muted-foreground">
                    You can only update the customer name and phone number.
                    Admin approval is required.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg p-1 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter customer name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Enter customer phone"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={submitLeadEditRequest}
                  disabled={savingEdit}
                  className="flex-1"
                >
                  {savingEdit ? 'Submitting...' : 'Submit for Approval'}
                </Button>

                <Button variant="ghost" onClick={closeEditModal}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showSubmitLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Submit a Customer Lead</h2>
                  <p className="text-sm text-muted-foreground">
                    Admin will review this information before it counts toward your approved performance.
                  </p>
                </div>
                <button type="button" onClick={closeSubmitLead} className="rounded-lg p-1 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Name *</label>
                <Input value={submitName} onChange={(event) => setSubmitName(event.target.value)} placeholder="Enter customer name" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number *</label>
                <Input type="tel" value={submitPhone} onChange={(event) => setSubmitPhone(event.target.value)} placeholder="e.g. +234 800 000 0000" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email (optional)</label>
                <Input type="email" value={submitEmail} onChange={(event) => setSubmitEmail(event.target.value)} placeholder="customer@example.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Product or Interest (optional)</label>
                <Input value={submitInterest} onChange={(event) => setSubmitInterest(event.target.value)} placeholder="What is the customer interested in?" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea value={submitNotes} onChange={(event) => setSubmitNotes(event.target.value)} placeholder="Useful context for Admin review" />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={closeSubmitLead} disabled={submittingLead}>Cancel</Button>
                <Button onClick={submitNewLead} disabled={submittingLead || !submitName.trim() || !submitPhone.trim()} className="gap-2">
                  <Send className="h-4 w-4" />
                  {submittingLead ? 'Submitting...' : 'Submit for Approval'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = '',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
