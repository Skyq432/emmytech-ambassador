'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
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
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Lead {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  ambassador_tag: string;
  source: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  referral_code_used: string | null;
  status: 'new' | 'contacted' | 'converted' | 'lost';
  notes: string | null;
  created_at: string;
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'contacted' | 'converted' | 'lost'>('all');

  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<Lead['status']>('new');
  const [editNotes, setEditNotes] = useState('');

  const supabase = createClient();

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('leads')
        .select('*, ambassadors(id, ambassador_tag, users(name))')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLeads(
        (data || []).map((l: any) => ({
          id: l.id,
          ambassador_id: l.ambassador_id,
          ambassador_name: l.ambassadors?.users?.name || 'Unknown',
          ambassador_tag: l.ambassadors?.ambassador_tag || '',
          source: l.source,
          customer_name: l.customer_name,
          customer_phone: l.customer_phone,
          customer_email: l.customer_email,
          referral_code_used: l.referral_code_used,
          status: l.status,
          notes: l.notes,
          created_at: l.created_at,
        }))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(lead: Lead) {
    setEditingLead(lead);
    setEditName(lead.customer_name || '');
    setEditPhone(lead.customer_phone || '');
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

  async function saveLeadUpdate() {
    if (!editingLead) return;

    if (!editPhone.trim()) {
      alert('Phone number is required.');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('leads')
      .update({
        customer_name: editName.trim() || null,
        customer_phone: editPhone.trim(),
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

    await fetchLeads();
    closeEditModal();
  }

  const filteredLeads = leads.filter((lead) => {
    const searchTerm = search.toLowerCase();

    const matchesSearch =
      lead.customer_phone.toLowerCase().includes(searchTerm) ||
      lead.ambassador_name.toLowerCase().includes(searchTerm) ||
      lead.ambassador_tag.toLowerCase().includes(searchTerm) ||
      lead.source.toLowerCase().includes(searchTerm) ||
      (lead.customer_name?.toLowerCase().includes(searchTerm) || false) ||
      (lead.customer_email?.toLowerCase().includes(searchTerm) || false);

    const matchesFilter = filter === 'all' || lead.status === filter;

    return matchesSearch && matchesFilter;
  });

  const totalLeads = leads.length;
  const newLeads = leads.filter((l) => l.status === 'new').length;
  const convertedLeads = leads.filter((l) => l.status === 'converted').length;

  const statusConfig: Record<string, { color: string; label: string }> = {
    new: { color: 'bg-blue-100 text-blue-700', label: 'New' },
    contacted: { color: 'bg-amber-100 text-amber-700', label: 'Contacted' },
    converted: { color: 'bg-emerald-100 text-emerald-700', label: 'Converted' },
    lost: { color: 'bg-red-100 text-red-700', label: 'Lost' },
  };

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
          Lead Management
        </h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">
          Track, edit and update all ambassador leads.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} title="Total Leads" value={totalLeads} />
        <StatCard icon={MessageCircle} title="New Leads" value={newLeads} />
        <StatCard icon={CheckCircle} title="Converted" value={convertedLeads} />
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'new', 'contacted', 'converted', 'lost'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className="shrink-0"
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 lg:hidden">
        {filteredLeads.length === 0 ? (
          <EmptyState />
        ) : (
          filteredLeads.map((lead) => {
            const status = statusConfig[lead.status] || statusConfig.new;

            return (
              <Card key={lead.id} className="rounded-2xl border-slate-200">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500">
                        <Phone className="h-4 w-4 text-white" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {lead.customer_name || lead.customer_phone}
                        </p>
                        <p className="text-sm text-slate-500">{lead.customer_phone}</p>
                        {lead.customer_email && (
                          <p className="truncate text-sm text-slate-500">
                            {lead.customer_email}
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Ambassador</p>
                      <p className="font-medium text-slate-800">
                        {lead.ambassador_name}
                      </p>
                      <p className="text-xs text-slate-500">{lead.ambassador_tag}</p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">Source</p>
                      <p className="capitalize text-slate-800">{lead.source}</p>
                      {lead.referral_code_used && (
                        <p className="text-xs text-slate-500">
                          Ref: {lead.referral_code_used}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-500">
                      <Calendar className="h-4 w-4" />
                      {formatDate(lead.created_at)}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => openEditModal(lead)}
                  >
                    <Edit className="h-4 w-4" />
                    Edit Lead
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <Card className="hidden overflow-hidden border-slate-200 shadow-sm lg:block">
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Lead</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Ambassador</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Source</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const status = statusConfig[lead.status] || statusConfig.new;

                  return (
                    <tr key={lead.id} className="border-b hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">
                          {lead.customer_name || lead.customer_phone}
                        </p>
                        <p className="text-sm text-slate-500">{lead.customer_phone}</p>
                        {lead.customer_email && (
                          <p className="text-sm text-slate-500">{lead.customer_email}</p>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-slate-700">
                          {lead.ambassador_name}
                        </p>
                        <p className="text-xs text-slate-500">{lead.ambassador_tag}</p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm capitalize text-slate-700">{lead.source}</p>
                        {lead.referral_code_used && (
                          <p className="text-xs text-slate-500">
                            Ref: {lead.referral_code_used}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500">
                        {formatDate(lead.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-blue-600"
                          onClick={() => openEditModal(lead)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-0 sm:max-w-xl sm:rounded-2xl">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Edit Lead</h2>
                  <p className="text-sm text-slate-500">
                    Update customer details after WhatsApp conversation.
                  </p>
                </div>

                <button onClick={closeEditModal} className="rounded-full p-2 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Customer Name">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </Field>

                <Field label="Phone Number">
                  <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                </Field>

                <Field label="Email">
                  <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </Field>

                <Field label="Status">
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Lead['status'])}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emmy-primary"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
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
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
}: {
  icon: any;
  title: string;
  value: number;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 sm:h-12 sm:w-12">
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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