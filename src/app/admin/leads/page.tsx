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
  ArrowLeft,
  ChevronRight,
  Inbox,
  Edit,
  Save,
  X,
} from 'lucide-react';
import Link from 'next/link';
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
  const [editStatus, setEditStatus] = useState<'new' | 'contacted' | 'converted' | 'lost'>('new');
  const [editNotes, setEditNotes] = useState('');

  const supabase = createClient();

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('leads')
        .select('*, ambassadors(id, ambassador_tag, users(name))')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted: Lead[] = (data || []).map((l: any) => ({
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
      }));

      setLeads(formatted);
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
    const matchesSearch =
      lead.customer_phone.toLowerCase().includes(search.toLowerCase()) ||
      lead.ambassador_name.toLowerCase().includes(search.toLowerCase()) ||
      lead.ambassador_tag.toLowerCase().includes(search.toLowerCase()) ||
      lead.source.toLowerCase().includes(search.toLowerCase()) ||
      (lead.customer_name?.toLowerCase().includes(search.toLowerCase()) || false) ||
      (lead.customer_email?.toLowerCase().includes(search.toLowerCase()) || false);

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
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200/50 bg-red-50/50 rounded-xl">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>

        <div className="h-6 w-px bg-slate-200" />

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Admin</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-900 font-medium">Leads</span>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">Lead Management</h1>
        <p className="text-slate-500 mt-1">
          Track, edit and update all ambassador leads.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalLeads}</p>
                <p className="text-sm text-slate-500">Total Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{newLeads}</p>
                <p className="text-sm text-slate-500">New Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{convertedLeads}</p>
                <p className="text-sm text-slate-500">Converted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-slate-200"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {(['all', 'new', 'contacted', 'converted', 'lost'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-slate-900 text-white border-0' : 'border-slate-200'}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Lead</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Ambassador</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Source</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Date</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Status</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Inbox className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-500 text-lg">No leads found</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Leads will appear here when ambassadors generate them.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const status = statusConfig[lead.status] || statusConfig.new;

                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                              <Phone className="w-4 h-4 text-white" />
                            </div>

                            <div>
                              <span className="font-medium text-slate-900 text-sm">
                                {lead.customer_name || lead.customer_phone}
                              </span>

                              <p className="text-xs text-slate-500">
                                {lead.customer_phone}
                              </p>

                              {lead.customer_email && (
                                <p className="text-xs text-slate-500">
                                  {lead.customer_email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-6">
                          <div>
                            <span className="text-sm font-medium text-slate-700">
                              {lead.ambassador_name}
                            </span>
                            <p className="text-xs text-slate-500">{lead.ambassador_tag}</p>
                          </div>
                        </td>

                        <td className="py-4 px-6">
                          <span className="text-sm text-slate-700 capitalize">
                            {lead.source}
                          </span>
                          {lead.referral_code_used && (
                            <p className="text-xs text-slate-500">
                              Ref: {lead.referral_code_used}
                            </p>
                          )}
                        </td>

                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Calendar className="w-4 h-4" />
                            {formatDate(lead.created_at)}
                          </div>
                        </td>

                        <td className="py-4 px-6">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </td>

                        <td className="py-4 px-6">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => openEditModal(lead)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-xl rounded-2xl">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Edit Lead</h2>
                  <p className="text-sm text-slate-500">
                    Update customer details after WhatsApp conversation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-full p-2 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer Name</label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Customer name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone Number</label>
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+234..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
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
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                  rows={4}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emmy-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
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