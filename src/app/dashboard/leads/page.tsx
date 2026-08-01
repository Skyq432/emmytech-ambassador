'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import {
  Phone,
  User,
  Pencil,
  X,
  AlertCircle,
  History,
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
  const [ambassadorId, setAmbassadorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    contacted: 0,
    converted: 0,
  });

  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  useEffect(() => {
    fetchLeads();
  }, []);

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

      const { data, error } = await supabase
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
          source_detail
        `
        )
        .eq('ambassador_id', ambassador.id)
        .is('merged_into_lead_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const leadRows = data || [];

      setLeads(leadRows);

      setStats({
        total: leadRows.length,
        pending: leadRows.filter((lead) => ['new', 'pending'].includes(lead.status)).length,
        contacted: leadRows.filter((lead) => lead.status === 'contacted').length,
        converted: leadRows.filter((lead) => lead.status === 'converted').length,
      });
    } catch (err: any) {
      setError(err.message || 'Unable to load leads.');
    } finally {
      setLoading(false);
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Leads</h1>
        <p className="text-muted-foreground">
          View and update basic customer lead details.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Leads" value={String(stats.total)} />
        <StatCard label="Pending" value={String(stats.pending)} accent="text-yellow-600" />
        <StatCard label="Contacted" value={String(stats.contacted)} accent="text-blue-600" />
        <StatCard label="Converted" value={String(stats.converted)} accent="text-emmy-secondary" />
      </div>

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
