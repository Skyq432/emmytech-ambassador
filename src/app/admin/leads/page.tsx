'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MessageCircle,
  Phone,
  Calendar,
  Search,
  Users,
  CheckCircle,
  Inbox,
  Edit,
  Save,
  X,
  Bell,
  Mail,
  User,
  Clock,
  MousePointerClick,
  Check,
  Ban,
  AlertCircle,
  TrendingUp,
  Percent,
  DollarSign,
  MoreHorizontal,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';

type LeadStatus = 'new' | 'pending' | 'contacted' | 'converted' | 'lost';
type EditStatus = 'none' | 'pending' | 'approved' | 'rejected' | null;
type LeadApprovalStatus = 'pending' | 'approved' | 'rejected' | null;

interface Lead {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  ambassador_tag: string;
  lead_code: string | null;
  source: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  referral_code_used: string | null;
  status: LeadStatus;
  lead_approval_status: LeadApprovalStatus;
  approved_as_lead: boolean | null;
  approved_at: string | null;
  notes: string | null;
  click_count: number | null;
  last_clicked_at: string | null;
  edit_status: EditStatus;
  pending_customer_name: string | null;
  pending_customer_phone: string | null;
  conversation_greeting: string | null;
  conversation_opening: string | null;
  conversation_closing: string | null;
  conversation_message: string | null;
  conversation_fingerprint: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Conversion {
  id: string;
  lead_id: string;
  ambassador_id: string;
  amount: number;
  commission_amount: number;
  commission_percentage: number | null;
  commission_rate: number | null;
  conversion_sequence: number | null;
  is_repeat_conversion: boolean | null;
  is_commissionable: boolean | null;
  admin_attention_required: boolean | null;
  approved_at: string;
}

function normalizeSearchText(value: string | null | undefined) {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getLeadDisplayName(lead: Lead) {
  if (
    lead.customer_name &&
    lead.customer_name.toLowerCase() !== 'whatsapp lead'
  ) {
    return lead.customer_name;
  }

  if (lead.source === 'whatsapp') {
    return 'New WhatsApp Enquiry';
  }

  return lead.customer_phone || 'New Lead';
}

function getConversationStart(lead: Lead) {
  return [lead.conversation_greeting, lead.conversation_opening]
    .filter(Boolean)
    .join(' ');
}

function getConversationPreview(lead: Lead) {
  const message = lead.conversation_message || getConversationStart(lead);
  return message || '';
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | LeadStatus | 'requests' | 'attention'>('all');

  const [manageLead, setManageLead] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [conversionLead, setConversionLead] = useState<Lead | null>(null);
  const [commissionReview, setCommissionReview] = useState<Conversion | null>(null);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<LeadStatus>('new');
  const [editNotes, setEditNotes] = useState('');

  const [conversionAmount, setConversionAmount] = useState('');
  const [commissionEnabled, setCommissionEnabled] = useState(true);
  const [commissionPercentage, setCommissionPercentage] = useState('5');

  const [reviewCommissionPercentage, setReviewCommissionPercentage] = useState('5');

  const supabase = createClient();

  useEffect(() => {
    fetchPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPageData() {
    try {
      setLoading(true);
      setError(null);

      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select(
          `
          *,
          ambassadors(
            id,
            ambassador_tag,
            users(name)
          )
        `
        )
        .is('merged_into_lead_id', null)
        .order('created_at', { ascending: false });

      if (leadError) throw leadError;

      const { data: conversionData, error: conversionError } = await supabase
        .from('conversions')
        .select('*')
        .order('approved_at', { ascending: false });

      if (conversionError) throw conversionError;

      setLeads(
        (leadData || []).map((lead: any) => ({
          id: lead.id,
          ambassador_id: lead.ambassador_id,
          ambassador_name: lead.ambassadors?.users?.name || 'Unknown',
          ambassador_tag: lead.ambassadors?.ambassador_tag || '',
          lead_code: lead.lead_code,
          source: lead.source || 'unknown',
          customer_name: lead.customer_name,
          customer_phone: lead.customer_phone,
          customer_email: lead.customer_email,
          referral_code_used: lead.referral_code_used,
          status: normalizeStatus(lead.status),
          lead_approval_status: lead.lead_approval_status || 'pending',
          approved_as_lead: Boolean(lead.approved_as_lead),
          approved_at: lead.approved_at || null,
          notes: lead.notes,
          click_count: lead.click_count || 0,
          last_clicked_at: lead.last_clicked_at,
          edit_status: lead.edit_status || 'none',
          pending_customer_name: lead.pending_customer_name,
          pending_customer_phone: lead.pending_customer_phone,
          conversation_greeting: lead.conversation_greeting || null,
          conversation_opening: lead.conversation_opening || null,
          conversation_closing: lead.conversation_closing || null,
          conversation_message: lead.conversation_message || null,
          conversation_fingerprint: lead.conversation_fingerprint || null,
          created_at: lead.created_at,
          updated_at: lead.updated_at,
        }))
      );

      setConversions(conversionData || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load leads.');
    } finally {
      setLoading(false);
    }
  }

  function normalizeStatus(status: string): LeadStatus {
    if (status === 'pending') return 'pending';
    if (status === 'contacted') return 'contacted';
    if (status === 'converted') return 'converted';
    if (status === 'lost') return 'lost';
    return 'new';
  }

  function getLeadConversions(leadId: string) {
    return conversions
      .filter((conversion) => conversion.lead_id === leadId)
      .sort((a, b) => Number(a.conversion_sequence || 0) - Number(b.conversion_sequence || 0));
  }

  function leadNeedsAttention(lead: Lead) {
    return (
      lead.edit_status === 'pending' ||
      lead.lead_approval_status === 'pending' ||
      getLeadConversions(lead.id).some((conversion) => conversion.admin_attention_required)
    );
  }

  function openEditModal(lead: Lead) {
    setEditingLead(lead);
    setEditName(lead.customer_name || '');
    setEditPhone(lead.customer_phone === 'Not provided' ? '' : lead.customer_phone || '');
    setEditEmail(lead.customer_email || '');
    setEditStatus(lead.status || 'new');
    setEditNotes(lead.notes || '');
  }

  function closeEditModal() {
    setEditingLead(null);
    setEditName('');
    setEditPhone('');
    setEditEmail('');
    setEditStatus('new');
    setEditNotes('');
  }

  function openConversionModal(lead: Lead) {
    setConversionLead(lead);
    setConversionAmount('');
    setCommissionEnabled(true);
    setCommissionPercentage('5');
  }

  function closeConversionModal() {
    setConversionLead(null);
    setConversionAmount('');
    setCommissionEnabled(true);
    setCommissionPercentage('5');
  }

  function openCommissionReview(conversion: Conversion) {
    setCommissionReview(conversion);
    setReviewCommissionPercentage('5');
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      alert('Unable to copy text.');
    }
  }

  async function saveLeadUpdate() {
    if (!editingLead) return;

    setSaving(true);

    const { error } = await supabase
      .from('leads')
      .update({
        customer_name: editName.trim() || null,
        customer_phone: editPhone.trim() || 'Not provided',
        customer_email: editEmail.trim() || null,
        status: editStatus,
        notes: editNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingLead.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await fetchPageData();
    closeEditModal();
  }

  async function approveEditRequest(lead: Lead) {
    const confirmed = window.confirm('Approve this lead update request?');

    if (!confirmed) return;

    setApprovalLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('approve_lead_edit_request', {
        p_admin_id: session.user.id,
        p_lead_id: lead.id,
      });

      if (error) throw error;

      await fetchPageData();
      setManageLead(null);
    } catch (err: any) {
      alert(err.message || 'Unable to approve request.');
    } finally {
      setApprovalLoading(false);
    }
  }

  async function rejectEditRequest(lead: Lead) {
    const confirmed = window.confirm('Reject this lead update request?');

    if (!confirmed) return;

    setApprovalLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('reject_lead_edit_request', {
        p_admin_id: session.user.id,
        p_lead_id: lead.id,
      });

      if (error) throw error;

      await fetchPageData();
      setManageLead(null);
    } catch (err: any) {
      alert(err.message || 'Unable to reject request.');
    } finally {
      setApprovalLoading(false);
    }
  }


  async function approveLeadForAmbassador(lead: Lead) {
    const confirmed = window.confirm(
      'Approve this pending lead? This will count it as a real lead for the ambassador.'
    );

    if (!confirmed) return;

    setApprovalLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('approve_lead_for_ambassador', {
        p_admin_id: session.user.id,
        p_lead_id: lead.id,
      });

      if (error) throw error;

      await fetchPageData();
      setManageLead(null);
    } catch (err: any) {
      alert(err.message || 'Unable to approve lead.');
    } finally {
      setApprovalLoading(false);
    }
  }


  async function rejectLeadForAmbassador(lead: Lead) {
    const reason = window.prompt(
      'Why are you rejecting this lead? Example: duplicate click, wrong customer, not genuine, no response.'
    );

    if (reason === null) return;

    const confirmed = window.confirm(
      'Reject this lead? It will not count for the ambassador, but the identity and history will remain saved.'
    );

    if (!confirmed) return;

    setApprovalLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('reject_lead_for_ambassador', {
        p_admin_id: session.user.id,
        p_lead_id: lead.id,
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      await fetchPageData();
      setManageLead(null);
    } catch (err: any) {
      alert(err.message || 'Unable to reject lead.');
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleConvertLead() {
    if (!conversionLead || !conversionAmount) return;

    const amount = parseFloat(conversionAmount);
    const percentage = commissionEnabled ? parseFloat(commissionPercentage) : 0;
    const previousConversions = getLeadConversions(conversionLead.id).length;

    if (Number.isNaN(amount) || amount <= 0) {
      alert('Please enter a valid sale amount.');
      return;
    }

    if (commissionEnabled && (Number.isNaN(percentage) || percentage <= 0)) {
      alert('Please enter a valid commission percentage, or select no commission.');
      return;
    }

    if (!commissionEnabled && previousConversions > 0) {
      const confirmed = window.confirm(
        'This is a repeat conversion without ambassador commission. It will be marked as reviewed later from this lead card. Continue?'
      );

      if (!confirmed) return;
    }

    setConverting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('admin_create_conversion', {
        p_admin_id: session.user.id,
        p_lead_id: conversionLead.id,
        p_amount: amount,
        p_commission_percentage: percentage,
      });

      if (error) throw error;

      await fetchPageData();
      closeConversionModal();
      setManageLead(null);
    } catch (err: any) {
      alert(err.message || 'Unable to convert lead.');
    } finally {
      setConverting(false);
    }
  }

  async function markConversionReviewed(conversion: Conversion) {
    const confirmed = window.confirm(
      'Approve this repeat conversion with no ambassador commission?'
    );

    if (!confirmed) return;

    setReviewLoading(conversion.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('resolve_conversion_no_commission', {
        p_admin_id: session.user.id,
        p_conversion_id: conversion.id,
      });

      if (error) throw error;

      await fetchPageData();
    } catch (err: any) {
      alert(err.message || 'Unable to mark conversion reviewed.');
    } finally {
      setReviewLoading(null);
    }
  }

  async function addCommissionToReviewedConversion() {
    if (!commissionReview) return;

    const percentage = parseFloat(reviewCommissionPercentage);

    if (Number.isNaN(percentage) || percentage <= 0) {
      alert('Please enter a valid commission percentage.');
      return;
    }

    setReviewLoading(commissionReview.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('add_commission_to_conversion', {
        p_admin_id: session.user.id,
        p_conversion_id: commissionReview.id,
        p_commission_percentage: percentage,
      });

      if (error) throw error;

      await fetchPageData();
      setCommissionReview(null);
    } catch (err: any) {
      alert(err.message || 'Unable to add commission.');
    } finally {
      setReviewLoading(null);
    }
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const searchTerm = normalizeSearchText(search);

      const searchableFields = [
        lead.customer_phone,
        lead.ambassador_name,
        lead.ambassador_tag,
        lead.source,
        lead.customer_name,
        lead.customer_email,
        lead.lead_code,
        lead.referral_code_used,
        lead.notes,
        lead.conversation_greeting,
        lead.conversation_opening,
        lead.conversation_closing,
        lead.conversation_message,
        lead.conversation_fingerprint,
      ]
        .map(normalizeSearchText)
        .filter(Boolean);

      const matchesSearch =
        !searchTerm ||
        searchableFields.some((field) => field.includes(searchTerm)) ||
        searchableFields.some((field) => searchTerm.includes(field) && field.length >= 8);

      const matchesFilter =
        filter === 'all' ||
        lead.status === filter ||
        (filter === 'requests' && lead.edit_status === 'pending') ||
        (filter === 'attention' && leadNeedsAttention(lead));

      return matchesSearch && matchesFilter;
    });
  }, [leads, conversions, search, filter]);

  const totalLeads = leads.length;
  const approvedLeads = leads.filter((lead) => lead.approved_as_lead === true).length;
  const pendingApprovalLeads = leads.filter((lead) => lead.lead_approval_status === 'pending').length;
  const rejectedLeads = leads.filter((lead) => lead.lead_approval_status === 'rejected').length;
  const convertedLeads = leads.filter((lead) => lead.status === 'converted').length;
  const attentionCount = leads.filter((lead) => leadNeedsAttention(lead)).length;

  const statusConfig: Record<LeadStatus, { color: string; label: string }> = {
    new: { color: 'bg-blue-100 text-blue-700', label: 'New' },
    pending: { color: 'bg-blue-100 text-blue-700', label: 'Pending' },
    contacted: { color: 'bg-amber-100 text-amber-700', label: 'Contacted' },
    converted: { color: 'bg-emerald-100 text-emerald-700', label: 'Converted' },
    lost: { color: 'bg-red-100 text-red-700', label: 'Lost' },
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200/60" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Lead Management
          </h1>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            Manage enquiries, updates, conversions, and reviews from one clean workspace.
          </p>
        </div>

        {attentionCount > 0 && (
          <Button onClick={() => setFilter('attention')} className="gap-2 bg-amber-600 hover:bg-amber-700">
            <Bell className="h-4 w-4" />
            {attentionCount} needs attention
          </Button>
        )}
      </div>

      <CompactLeadSummary
        totalLeads={totalLeads}
        approvedLeads={approvedLeads}
        pendingApprovalLeads={pendingApprovalLeads}
        rejectedLeads={rejectedLeads}
        convertedLeads={convertedLeads}
        attentionCount={attentionCount}
        onAttentionClick={() => setFilter('attention')}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search name, phone, lead ID, ambassador, or paste WhatsApp conversation..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-0 bg-slate-50 pl-9 shadow-none"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(['all', 'attention', 'requests', 'new', 'pending', 'contacted', 'converted', 'lost'] as const).map((item) => (
            <Button
              key={item}
              variant={filter === item ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(item)}
              className="shrink-0"
            >
              {item === 'attention'
                ? `Attention${attentionCount ? ` (${attentionCount})` : ''}`
                : item === 'requests'
                  ? 'Requests'
                  : item.charAt(0).toUpperCase() + item.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {filteredLeads.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => {
                const status = statusConfig[lead.status] || statusConfig.new;
                const leadConversions = getLeadConversions(lead.id);
                const needsAttention = leadNeedsAttention(lead);
                return (
                  <div
                    key={lead.id}
                    className="flex flex-col gap-3 p-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <LeadIcon lead={lead} hasAttention={needsAttention} />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-slate-900">
                            {getLeadDisplayName(lead)}
                          </p>
                          {needsAttention && <AttentionDot />}
                        </div>

                        <p className="mt-1 truncate text-sm text-slate-500">
                          {lead.customer_phone && lead.customer_phone !== 'Not provided'
                            ? lead.customer_phone
                            : 'Phone not yet provided'}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span>{lead.lead_code || 'No lead ID'}</span>
                          <span>•</span>
                          <span>{lead.ambassador_name}</span>
                          <span>•</span>
                          <span>{formatDate(lead.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <ApprovalPill lead={lead} />

                      <Button
                        size="sm"
                        variant={needsAttention ? 'default' : 'outline'}
                        className="gap-2 rounded-xl"
                        onClick={() => setManageLead(lead)}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        Manage
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {manageLead && (
        <ManageLeadModal
          lead={manageLead}
          conversions={getLeadConversions(manageLead.id)}
          statusColor={statusConfig[manageLead.status]?.color || statusConfig.new.color}
          statusLabel={statusConfig[manageLead.status]?.label || 'New'}
          approvalLoading={approvalLoading}
          reviewLoading={reviewLoading}
          onClose={() => setManageLead(null)}
          onApprove={() => approveEditRequest(manageLead)}
          onReject={() => rejectEditRequest(manageLead)}
          onApproveLead={() => approveLeadForAmbassador(manageLead)}
          onRejectLead={() => rejectLeadForAmbassador(manageLead)}
          onEdit={() => openEditModal(manageLead)}
          onConvert={() => openConversionModal(manageLead)}
          onMarkReviewed={markConversionReviewed}
          onAddCommission={openCommissionReview}
          onCopy={copyText}
        />
      )}

      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-0 sm:max-w-xl sm:rounded-2xl">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Edit Lead</h2>
                  <p className="text-sm text-slate-500">
                    Admin can update lead details directly.
                  </p>
                </div>

                <button onClick={closeEditModal} className="rounded-full p-2 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer Name">
                  <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                </Field>

                <Field label="Phone Number">
                  <Input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} />
                </Field>

                <Field label="Email">
                  <Input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} />
                </Field>

                <Field label="Status">
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as LeadStatus)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emmy-primary"
                  >
                    <option value="new">New</option>
                    <option value="pending">Pending</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emmy-primary"
                />
              </Field>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={closeEditModal}>
                  Cancel
                </Button>

                <Button onClick={saveLeadUpdate} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {conversionLead && (
        <ConversionModal
          lead={conversionLead}
          previousConversions={getLeadConversions(conversionLead.id).length}
          conversionAmount={conversionAmount}
          setConversionAmount={setConversionAmount}
          commissionEnabled={commissionEnabled}
          setCommissionEnabled={setCommissionEnabled}
          commissionPercentage={commissionPercentage}
          setCommissionPercentage={setCommissionPercentage}
          converting={converting}
          onConvert={handleConvertLead}
          onClose={closeConversionModal}
        />
      )}

      {commissionReview && (
        <CommissionReviewModal
          conversion={commissionReview}
          percentage={reviewCommissionPercentage}
          setPercentage={setReviewCommissionPercentage}
          loading={reviewLoading === commissionReview.id}
          onSubmit={addCommissionToReviewedConversion}
          onClose={() => setCommissionReview(null)}
        />
      )}
    </div>
  );
}

function ManageLeadModal({
  lead,
  conversions,
  statusColor,
  statusLabel,
  approvalLoading,
  reviewLoading,
  onClose,
  onApprove,
  onReject,
  onApproveLead,
  onRejectLead,
  onEdit,
  onConvert,
  onMarkReviewed,
  onAddCommission,
  onCopy,
}: {
  lead: Lead;
  conversions: Conversion[];
  statusColor: string;
  statusLabel: string;
  approvalLoading: boolean;
  reviewLoading: string | null;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onApproveLead: () => void;
  onRejectLead: () => void;
  onEdit: () => void;
  onConvert: () => void;
  onMarkReviewed: (conversion: Conversion) => void;
  onAddCommission: (conversion: Conversion) => void;
  onCopy: (value: string) => void;
}) {
  const attentionConversions = conversions.filter((conversion) => conversion.admin_attention_required);
  const conversationMessage = getConversationPreview(lead);
  const hasAction =
    lead.lead_approval_status === 'pending' ||
    lead.edit_status === 'pending' ||
    attentionConversions.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <Card className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-0 sm:max-w-3xl sm:rounded-3xl">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">Manage Lead</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>
                  {statusLabel}
                </span>
                <ApprovalPill lead={lead} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {lead.lead_code || 'No lead ID'} · {lead.ambassador_name}
              </p>
            </div>

            <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          {hasAction && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber-950">Action needed</p>
                  <p className="mt-1 text-sm text-amber-700">
                    Resolve only what matters now. Full customer history is saved in the CRM timeline.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {lead.lead_approval_status === 'pending' && (
                      <>
                        <Button
                          onClick={onApproveLead}
                          disabled={approvalLoading}
                          size="sm"
                          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-4 w-4" />
                          {approvalLoading ? 'Approving...' : 'Approve Lead'}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={onRejectLead}
                          disabled={approvalLoading}
                          size="sm"
                          className="gap-2 border-red-200 bg-white text-red-600 hover:bg-red-50"
                        >
                          <Ban className="h-4 w-4" />
                          Reject Lead
                        </Button>
                      </>
                    )}

                    {lead.edit_status === 'pending' && (
                      <>
                        <Button onClick={onApprove} disabled={approvalLoading} size="sm" className="gap-2">
                          <Check className="h-4 w-4" />
                          Approve Update
                        </Button>
                        <Button variant="outline" onClick={onReject} disabled={approvalLoading} size="sm" className="gap-2">
                          <Ban className="h-4 w-4" />
                          Reject Update
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{getLeadDisplayName(lead)}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {lead.customer_phone && lead.customer_phone !== 'Not provided'
                      ? lead.customer_phone
                      : 'Phone not yet provided'}
                  </p>
                </div>
                <LeadIcon lead={lead} hasAttention={hasAction} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniInfo label="Email" value={lead.customer_email || 'Not provided'} />
                <MiniInfo label="Source" value={lead.source} />
                <MiniInfo label="Created" value={formatDate(lead.created_at)} />
                <MiniInfo label="Clicks" value={String(lead.click_count || 0)} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick actions</p>
              <div className="mt-4 grid gap-2">
                <Link
                  href={`/admin/leads/${lead.id}`}
                  className="inline-flex h-10 items-center justify-start gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emmy-primary/25 hover:bg-blue-50/60 hover:text-emmy-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Unified Timeline
                </Link>
                <Button variant="outline" onClick={onEdit} className="justify-start gap-2 bg-white">
                  <Edit className="h-4 w-4" />
                  Edit Lead Details
                </Button>
                <Button onClick={onConvert} className="justify-start gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Add Conversion
                </Button>
              </div>

              <div className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Conversions: {conversions.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {attentionConversions.length > 0
                    ? `${attentionConversions.length} conversion needs review.`
                    : 'No conversion review pending.'}
                </p>
              </div>
            </div>
          </div>

          {conversationMessage && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-950">WhatsApp match</p>
                  <p className="mt-1 text-xs text-blue-700">
                    Conversation text found for this lead.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onCopy(conversationMessage)}
                  className="gap-2 bg-white"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <p className="mt-3 max-h-28 overflow-y-auto whitespace-pre-line rounded-xl bg-white p-3 text-sm leading-6 text-slate-700">
                {conversationMessage}
              </p>
            </div>
          )}

          {lead.edit_status === 'pending' && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Requested update</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CompareBox label="Requested Name" value={lead.pending_customer_name || 'Not provided'} highlight />
                <CompareBox label="Requested Phone" value={lead.pending_customer_phone || 'Not provided'} highlight />
              </div>
            </div>
          )}

          {attentionConversions.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-900">Conversion review</p>
              <div className="mt-3 space-y-2">
                {attentionConversions.map((conversion) => (
                  <div key={conversion.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-700">
                      Sale {formatCurrency(conversion.amount)} · No commission yet
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => onAddCommission(conversion)} disabled={reviewLoading === conversion.id}>
                        Add Commission
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onMarkReviewed(conversion)} disabled={reviewLoading === conversion.id}>
                        Approve No Commission
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConversionModal({
  lead,
  previousConversions,
  conversionAmount,
  setConversionAmount,
  commissionEnabled,
  setCommissionEnabled,
  commissionPercentage,
  setCommissionPercentage,
  converting,
  onConvert,
  onClose,
}: {
  lead: Lead;
  previousConversions: number;
  conversionAmount: string;
  setConversionAmount: (value: string) => void;
  commissionEnabled: boolean;
  setCommissionEnabled: (value: boolean) => void;
  commissionPercentage: string;
  setCommissionPercentage: (value: string) => void;
  converting: boolean;
  onConvert: () => void;
  onClose: () => void;
}) {
  const amount = parseFloat(conversionAmount || '0');
  const percentage = parseFloat(commissionPercentage || '0');
  const previewCommission =
    commissionEnabled && Number.isFinite(amount) && Number.isFinite(percentage)
      ? (amount * percentage) / 100
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <Card className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-0 sm:max-w-xl sm:rounded-2xl">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <ModalHeader title="Add Conversion" subtitle="Add a sale conversion for this lead." onClose={onClose} />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">{getLeadDisplayName(lead)}</p>
            <p className="text-sm text-slate-500">{lead.customer_phone || 'No phone'}</p>
            <p className="mt-2 text-xs text-slate-500">
              This will be conversion #{previousConversions + 1}.
              {previousConversions > 0 ? ' This is a repeat conversion.' : ' This is the first conversion.'}
            </p>
          </div>

          <Field label="Sale Amount">
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Sale amount"
                value={conversionAmount}
                onChange={(event) => setConversionAmount(event.target.value)}
                className="pl-9"
              />
            </div>
          </Field>

          <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={commissionEnabled}
                onChange={(event) => setCommissionEnabled(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold text-slate-900">Add ambassador commission</span>
                <span className="block text-xs text-slate-500">
                  Untick this when a repeat sale should not pay ambassador commission.
                </span>
              </span>
            </label>

            {commissionEnabled ? (
              <div className="space-y-2">
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Commission percentage e.g. 5, 13.74, 15"
                    value={commissionPercentage}
                    onChange={(event) => setCommissionPercentage(event.target.value)}
                    className="pl-9"
                  />
                </div>

                <p className="text-xs text-slate-500">
                  Estimated commission:{' '}
                  <strong className="text-slate-900">
                    {formatCurrency(Number.isFinite(previewCommission) ? previewCommission : 0)}
                  </strong>
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                No commission will be added. Repeat conversions will need admin review.
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={onConvert} disabled={converting || !conversionAmount}>
              {converting ? 'Saving...' : 'Save Conversion'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CommissionReviewModal({
  conversion,
  percentage,
  setPercentage,
  loading,
  onSubmit,
  onClose,
}: {
  conversion: Conversion;
  percentage: string;
  setPercentage: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const amount = Number(conversion.amount || 0);
  const rate = parseFloat(percentage || '0');
  const preview = Number.isFinite(rate) ? (amount * rate) / 100 : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <Card className="w-full rounded-t-3xl border-0 sm:max-w-md sm:rounded-2xl">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <ModalHeader title="Add Commission" subtitle="Add commission to this reviewed repeat conversion." onClose={onClose} />

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Sale Amount</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(conversion.amount)}</p>
          </div>

          <Field label="Commission Percentage">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            />
          </Field>

          <p className="text-sm text-slate-500">
            Commission to add: <strong className="text-slate-900">{formatCurrency(preview)}</strong>
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} disabled={loading}>
              {loading ? 'Adding...' : 'Add Commission'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function LeadIcon({ lead, hasAttention }: { lead: Lead; hasAttention: boolean }) {
  return (
    <div className="relative mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500">
      <Phone className="h-4 w-4 text-white" />
      {lead.edit_status === 'pending' && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
          <Bell className="h-3 w-3 text-white" />
        </span>
      )}
      {hasAttention && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
          <AlertCircle className="h-3 w-3 text-white" />
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card className={`rounded-2xl ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CompareBox({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-white text-amber-900' : 'bg-amber-100/70 text-amber-800'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 break-words text-sm font-bold">{value}</p>
    </div>
  );
}

function BadgeText({ label }: { label: string }) {
  return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{label}</span>;
}

function AttentionBadge({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
      danger ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {danger ? <AlertCircle className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
      {label}
    </span>
  );
}


function CompactLeadSummary({
  totalLeads,
  approvedLeads,
  pendingApprovalLeads,
  rejectedLeads,
  convertedLeads,
  attentionCount,
  onAttentionClick,
}: {
  totalLeads: number;
  approvedLeads: number;
  pendingApprovalLeads: number;
  rejectedLeads: number;
  convertedLeads: number;
  attentionCount: number;
  onAttentionClick: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Lead overview</p>
          <p className="mt-1 text-xs text-slate-500">
            Showing essential numbers only. Open each lead to manage the full details.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:w-auto">
          <SummaryNumber label="Total" value={totalLeads} />
          <SummaryNumber label="Approved" value={approvedLeads} positive />
          <SummaryNumber label="Pending" value={pendingApprovalLeads} warning />
          <SummaryNumber label="Rejected" value={rejectedLeads} muted />
          <SummaryNumber label="Converted" value={convertedLeads} positive />
          <button type="button" onClick={onAttentionClick} className="text-left">
            <SummaryNumber label="Attention" value={attentionCount} warning={attentionCount > 0} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryNumber({
  label,
  value,
  positive = false,
  warning = false,
  muted = false,
}: {
  label: string;
  value: number;
  positive?: boolean;
  warning?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className={`text-lg font-bold ${positive ? 'text-emerald-600' : warning ? 'text-amber-600' : muted ? 'text-slate-400' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

function ApprovalPill({ lead }: { lead: Lead }) {
  if (lead.approved_as_lead) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">Approved</span>;
  }

  if (lead.lead_approval_status === 'rejected') {
    return <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Rejected</span>;
  }

  return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">Pending</span>;
}

function AttentionDot() {
  return <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />;
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, alert = false }: { icon: any; title: string; value: number; alert?: boolean }) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${alert ? 'bg-amber-500' : 'bg-blue-500'}`}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-12 text-center">
      <Inbox className="mx-auto mb-4 h-14 w-14 text-slate-300" />
      <p className="text-lg text-slate-500">No leads found</p>
      <p className="mt-1 text-sm text-slate-400">
        Leads will appear here when ambassadors generate them.
      </p>
    </div>
  );
}
