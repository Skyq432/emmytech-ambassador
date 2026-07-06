'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';

type LeadStatus = 'new' | 'pending' | 'contacted' | 'converted' | 'lost';
type EditStatus = 'none' | 'pending' | 'approved' | 'rejected' | null;

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
      const conversationStart = normalizeSearchText(getConversationStart(lead));
      const conversationMessage = normalizeSearchText(lead.conversation_message);

      const matchesSearch =
        !searchTerm ||
        normalizeSearchText(lead.customer_phone).includes(searchTerm) ||
        normalizeSearchText(lead.ambassador_name).includes(searchTerm) ||
        normalizeSearchText(lead.ambassador_tag).includes(searchTerm) ||
        normalizeSearchText(lead.source).includes(searchTerm) ||
        normalizeSearchText(lead.customer_name).includes(searchTerm) ||
        normalizeSearchText(lead.customer_email).includes(searchTerm) ||
        normalizeSearchText(lead.lead_code).includes(searchTerm) ||
        normalizeSearchText(lead.conversation_greeting).includes(searchTerm) ||
        normalizeSearchText(lead.conversation_opening).includes(searchTerm) ||
        normalizeSearchText(lead.conversation_closing).includes(searchTerm) ||
        normalizeSearchText(lead.conversation_fingerprint).includes(searchTerm) ||
        conversationMessage.includes(searchTerm) ||
        searchTerm.includes(conversationStart) ||
        searchTerm.includes(conversationMessage);

      const matchesFilter =
        filter === 'all' ||
        lead.status === filter ||
        (filter === 'requests' && lead.edit_status === 'pending') ||
        (filter === 'attention' && leadNeedsAttention(lead));

      return matchesSearch && matchesFilter;
    });
  }, [leads, conversions, search, filter]);

  const totalLeads = leads.length;
  const newLeads = leads.filter((lead) => lead.status === 'new' || lead.status === 'pending').length;
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} title="Total Leads" value={totalLeads} />
        <StatCard icon={MessageCircle} title="New / Pending" value={newLeads} />
        <StatCard icon={CheckCircle} title="Converted" value={convertedLeads} />
        <StatCard icon={AlertCircle} title="Needs Attention" value={attentionCount} alert={attentionCount > 0} />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Paste WhatsApp message, or search by name, phone, lead ID, ambassador..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
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
                    className="grid gap-4 p-4 hover:bg-slate-50 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px_140px]"
                  >
                    <div className="flex min-w-0 gap-3">
                      <LeadIcon lead={lead} hasAttention={needsAttention} />

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {getLeadDisplayName(lead)}
                        </p>

                        <p className="mt-1 truncate text-sm text-slate-500">
                          {lead.customer_phone && lead.customer_phone !== 'Not provided'
                            ? lead.customer_phone
                            : 'Phone not yet provided'}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-400">
                            {lead.lead_code || 'No lead ID yet'}
                          </span>

                          {lead.conversation_message && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                              WhatsApp match ready
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {lead.ambassador_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">{lead.ambassador_tag}</p>
                      <p className="mt-1 text-xs capitalize text-slate-400">
                        {lead.source} · {formatDate(lead.created_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {leadConversions.length} conversion{leadConversions.length === 1 ? '' : 's'}
                      </p>
                      {needsAttention ? (
                        <p className="text-xs font-semibold text-amber-600">Review needed</p>
                      ) : (
                        <p className="text-xs text-slate-500">No pending issue</p>
                      )}

                      <p className="mt-1 text-xs text-slate-400">
                        {lead.click_count || 0} click{Number(lead.click_count || 0) === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>

                      <Button
                        size="sm"
                        variant={needsAttention ? 'default' : 'outline'}
                        className="gap-2"
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
  onEdit: () => void;
  onConvert: () => void;
  onMarkReviewed: (conversion: Conversion) => void;
  onAddCommission: (conversion: Conversion) => void;
  onCopy: (value: string) => void;
}) {
  const attentionConversions = conversions.filter((conversion) => conversion.admin_attention_required);
  const conversationMessage = getConversationPreview(lead);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <Card className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-0 sm:max-w-4xl sm:rounded-2xl">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">Manage Lead</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>
                  {statusLabel}
                </span>
                {lead.edit_status === 'pending' && <AttentionBadge label="Update request" />}
                {attentionConversions.length > 0 && <AttentionBadge label="Conversion review" danger />}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Match WhatsApp enquiries, edit details, convert leads, and resolve reviews.
              </p>
            </div>

            <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          {conversationMessage && (
            <Section title="WhatsApp Conversation Match">
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                    Use this only when matching a WhatsApp chat to this lead
                  </p>

                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-800">
                    {conversationMessage}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onCopy(conversationMessage)}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Message
                    </Button>

                    {lead.conversation_fingerprint && (
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
                        {lead.conversation_fingerprint}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <CompareBox label="Greeting" value={lead.conversation_greeting || 'Not recorded'} highlight />
                  <CompareBox label="Opening" value={lead.conversation_opening || 'Not recorded'} />
                  <CompareBox label="Closing" value={lead.conversation_closing || 'Not recorded'} />
                </div>
              </div>
            </Section>
          )}

          {lead.edit_status === 'pending' && (
            <Section title="Pending Ambassador Update" tone="warning">
              <div className="grid gap-3 sm:grid-cols-2">
                <CompareBox label="Current Name" value={lead.customer_name || 'Not provided'} />
                <CompareBox label="Requested Name" value={lead.pending_customer_name || 'Not provided'} highlight />
                <CompareBox label="Current Phone" value={lead.customer_phone || 'Not provided'} />
                <CompareBox label="Requested Phone" value={lead.pending_customer_phone || 'Not provided'} highlight />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button onClick={onApprove} disabled={approvalLoading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <Check className="h-4 w-4" />
                  {approvalLoading ? 'Approving...' : 'Approve Update'}
                </Button>

                <Button variant="outline" onClick={onReject} disabled={approvalLoading} className="gap-2 border-red-200 text-red-600 hover:bg-red-50">
                  <Ban className="h-4 w-4" />
                  Reject
                </Button>
              </div>
            </Section>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem icon={User} label="Customer Name" value={lead.customer_name || 'Not provided'} />
            <DetailItem icon={Phone} label="Phone" value={lead.customer_phone || 'Not provided'} />
            <DetailItem icon={Mail} label="Email" value={lead.customer_email || 'Not provided'} />
            <DetailItem icon={Users} label="Ambassador" value={lead.ambassador_name} />
            <DetailItem icon={MessageCircle} label="Source" value={lead.source} />
            <DetailItem icon={Calendar} label="Created" value={formatDate(lead.created_at)} />
            <DetailItem icon={Clock} label="Last Clicked" value={lead.last_clicked_at ? formatDate(lead.last_clicked_at) : 'Not recorded'} />
            <DetailItem icon={MousePointerClick} label="Clicks" value={String(lead.click_count || 0)} />
          </div>

          <Section title="Conversion History">
            {conversions.length === 0 ? (
              <p className="text-sm text-slate-500">No conversions yet.</p>
            ) : (
              <div className="space-y-3">
                {conversions.map((conversion) => {
                  const percentage =
                    conversion.commission_percentage ??
                    (conversion.commission_rate ? conversion.commission_rate * 100 : null);

                  return (
                    <div key={conversion.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              Conversion #{conversion.conversion_sequence || 1}
                            </p>
                            {conversion.is_repeat_conversion && <BadgeText label="Repeat" />}
                            {conversion.admin_attention_required && <AttentionBadge label="Needs review" danger />}
                            {conversion.is_commissionable === false && <BadgeText label="No commission" />}
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(conversion.approved_at)}
                          </p>

                          <p className="mt-2 text-sm text-slate-600">
                            Sale: <strong>{formatCurrency(conversion.amount)}</strong> · Commission:{' '}
                            <strong>{formatCurrency(conversion.commission_amount || 0)}</strong>
                            {percentage && conversion.is_commissionable !== false ? ` (${percentage}%)` : ''}
                          </p>
                        </div>

                        {conversion.admin_attention_required && (
                          <div className="flex flex-col gap-2 sm:w-52">
                            <Button
                              size="sm"
                              onClick={() => onAddCommission(conversion)}
                              disabled={reviewLoading === conversion.id}
                              className="gap-2"
                            >
                              <Percent className="h-4 w-4" />
                              Add Commission
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onMarkReviewed(conversion)}
                              disabled={reviewLoading === conversion.id}
                              className="gap-2"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Approve No Commission
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {lead.notes && (
            <Section title="Notes">
              <p className="text-sm text-slate-600">{lead.notes}</p>
            </Section>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onEdit} className="gap-2">
              <Edit className="h-4 w-4" />
              Edit Lead
            </Button>
            <Button onClick={onConvert} className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Add Conversion
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
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
