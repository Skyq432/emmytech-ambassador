'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  User,
  Users,
  TrendingUp,
  DollarSign,
  Plus,
  Send,
  PauseCircle,
  PlayCircle,
  Trash2,
  Shield,
  Activity,
  AlertTriangle,
  Percent,
  Gift,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';

interface AmbassadorDetail {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  ambassador_tag: string;
  referral_code: string;
  custom_referral_code: string | null;
  whatsapp_number: string;
  whatsapp_link: string;
  bio: string | null;
  social_links: Record<string, string>;
  total_leads: number;
  total_conversions: number;
  total_cashed_out: number;
  available_balance: number;
  status: string;
  created_at: string;
  date_of_birth: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
}

interface Lead {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  created_at: string;
}

interface PostActivity {
  id: string;
  platform: string;
  post_url: string;
  status: string;
  submitted_at: string;
}

interface Conversion {
  id: string;
  lead_id?: string | null;
  amount: number;
  commission_amount: number;
  commission_rate?: number | null;
  commission_percentage?: number | null;
  conversion_sequence?: number | null;
  is_repeat_conversion?: boolean | null;
  is_commissionable?: boolean | null;
  ambassador_notified?: boolean | null;
  admin_attention_required?: boolean | null;
  internal_note?: string | null;
  approved_at: string;
}

interface Payout {
  id: string;
  lead_id?: string | null;
  amount: number;
  status: string;
  paid_at: string;
  notes: string | null;
  created_at?: string;
}

interface Bonus {
  id: string;
  lead_id?: string | null;
  amount: number;
  reason: string | null;
  created_at: string;
}

export default function AmbassadorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ambassadorId = params.id as string;
  const supabase = createClient();

  const [ambassador, setAmbassador] = useState<AmbassadorDetail | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<PostActivity[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'leads' | 'activity' | 'conversions' | 'payouts'
  >('overview');

  const [showAddLead, setShowAddLead] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [addingLead, setAddingLead] = useState(false);

  const [showAddConversion, setShowAddConversion] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [conversionAmount, setConversionAmount] = useState('');
  const [commissionPercentage, setCommissionPercentage] = useState('5');
  const [commissionEnabled, setCommissionEnabled] = useState(true);
  const [addingConversion, setAddingConversion] = useState(false);

  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [processingPayout, setProcessingPayout] = useState(false);

  const [showBonus, setShowBonus] = useState(false);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [addingBonus, setAddingBonus] = useState(false);

  useEffect(() => {
    if (ambassadorId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambassadorId]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data: ambData, error: ambError } = await supabase
        .from('ambassadors')
        .select('*, users(name, email, avatar_url, created_at)')
        .eq('id', ambassadorId)
        .maybeSingle();

      if (ambError) throw ambError;

      if (ambData) {
        setAmbassador({
          ...ambData,
          name: ambData.users?.name || 'Unknown',
          email: ambData.users?.email || '',
          avatar_url: ambData.users?.avatar_url,
          created_at: ambData.users?.created_at,
        });
      } else {
        setAmbassador(null);
      }

      const { data: leadsData } = await supabase
        .from('leads')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('created_at', { ascending: false });

      setLeads(leadsData || []);

      const { data: actData } = await supabase
        .from('activities')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('submitted_at', { ascending: false });

      setActivities(actData || []);

      const { data: convData } = await supabase
        .from('conversions')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('approved_at', { ascending: false });

      setConversions(convData || []);

      const { data: payData } = await supabase
        .from('payouts')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('created_at', { ascending: false });

      setPayouts(payData || []);

      const { data: bonusData } = await supabase
        .from('ambassador_bonuses')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('created_at', { ascending: false });

      setBonuses(bonusData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateAmbassadorStatus = async (newStatus: 'active' | 'suspended') => {
    if (!ambassador) return;

    const confirmed = window.confirm(
      newStatus === 'suspended'
        ? 'Pause this ambassador? They will not be able to continue as active until reactivated.'
        : 'Reactivate this ambassador?'
    );

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from('ambassadors')
        .update({ status: newStatus })
        .eq('id', ambassador.id);

      if (error) throw error;

      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Unable to update ambassador status.');
    } finally {
      setActionLoading(false);
    }
  };

  const softDeleteAmbassador = async () => {
    if (!ambassador) return;

    const confirmed = window.confirm(
      'SOFT DELETE\n\nThis will hide this ambassador from the active ambassador list and stop them from using the dashboard, but their leads, conversions, payout history and referral history will remain in the database.\n\nYou can restore them later by changing their status back to active.\n\nContinue?'
    );

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from('ambassadors')
        .update({ status: 'deleted' })
        .eq('id', ambassador.id);

      if (error) throw error;

      alert('Ambassador soft deleted.');
      router.push('/admin/ambassadors');
    } catch (err: any) {
      alert(err.message || 'Unable to soft delete ambassador.');
    } finally {
      setActionLoading(false);
    }
  };

  const hardDeleteAmbassador = async () => {
    if (!ambassador) return;

    const confirmed = window.confirm(
      '⚠️ HARD DELETE\n\nThis will permanently delete this ambassador and ALL related data including:\n\n• Leads\n• Activities\n• Conversions\n• Payouts\n• Referral Clicks\n• Visitor Sessions\n• Product Views\n• Cart Events\n\nThis cannot be undone.\n\nOnly continue if you want this ambassador to start from zero if they register again.'
    );

    if (!confirmed) return;

    const finalConfirm = window.confirm(
      'Final confirmation: permanently erase this ambassador and all related records?'
    );

    if (!finalConfirm) return;

    setActionLoading(true);

    try {
      const { error } = await supabase.rpc('hard_delete_ambassador', {
        p_ambassador_id: ambassador.id,
      });

      if (error) throw error;

      alert('Ambassador permanently deleted.');
      router.push('/admin/ambassadors');
    } catch (err: any) {
      alert(err.message || 'Unable to hard delete ambassador.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLead = async () => {
    if (!leadName || !leadPhone) return;
    setAddingLead(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('admin_create_lead', {
        p_admin_id: session.user.id,
        p_ambassador_id: ambassadorId,
        p_customer_name: leadName,
        p_customer_phone: leadPhone,
        p_customer_email: leadEmail || null,
        p_source: 'direct',
        p_notes: leadNotes || null,
      });

      if (error) throw error;

      setLeadName('');
      setLeadPhone('');
      setLeadEmail('');
      setLeadNotes('');
      setShowAddLead(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingLead(false);
    }
  };

  const handleAddConversion = async () => {
    if (!selectedLeadId || !conversionAmount) return;
    if (commissionEnabled && !commissionPercentage) return;

    const amount = parseFloat(conversionAmount);
    const percentage = commissionEnabled ? parseFloat(commissionPercentage) : 0;

    if (Number.isNaN(amount) || amount <= 0) {
      alert('Please enter a valid sale amount.');
      return;
    }

    if (commissionEnabled && (Number.isNaN(percentage) || percentage <= 0)) {
      alert('Please enter a valid commission percentage, or select no commission.');
      return;
    }

    const selectedLeadPreviousConversions = conversions.filter(
      (conversion) => conversion.lead_id === selectedLeadId
    ).length;

    if (!commissionEnabled && selectedLeadPreviousConversions > 0) {
      const confirmed = window.confirm(
        'This is a repeat conversion without ambassador commission. It will be saved and flagged for admin attention. Continue?'
      );

      if (!confirmed) return;
    }

    setAddingConversion(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('admin_create_conversion', {
        p_admin_id: session.user.id,
        p_lead_id: selectedLeadId,
        p_amount: amount,
        p_commission_percentage: percentage,
      });

      if (error) throw error;

      setSelectedLeadId('');
      setConversionAmount('');
      setCommissionPercentage('5');
      setCommissionEnabled(true);
      setShowAddConversion(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingConversion(false);
    }
  };

  const handlePayout = async () => {
    if (!payoutAmount) return;
    setProcessingPayout(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('process_payout', {
        p_admin_id: session.user.id,
        p_ambassador_id: ambassadorId,
        p_points_paid: 0,
        p_amount: parseFloat(payoutAmount),
        p_notes: payoutNotes || null,
      });

      if (error) throw error;

      setPayoutAmount('');
      setPayoutNotes('');
      setShowPayout(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessingPayout(false);
    }
  };

  const handleAddBonus = async () => {
    if (!bonusAmount) return;

    const amount = parseFloat(bonusAmount);

    if (Number.isNaN(amount) || amount <= 0) {
      alert('Please enter a valid bonus amount.');
      return;
    }

    setAddingBonus(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('admin_add_ambassador_bonus', {
        p_admin_id: session.user.id,
        p_ambassador_id: ambassadorId,
        p_amount: amount,
        p_reason: bonusReason || null,
      });

      if (error) throw error;

      setBonusAmount('');
      setBonusReason('');
      setShowBonus(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Unable to add bonus.');
    } finally {
      setAddingBonus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emmy-primary" />
      </div>
    );
  }

  if (!ambassador) {
    return <p className="py-12 text-center text-slate-500">Ambassador not found</p>;
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: User },
    { key: 'leads', label: `Leads (${leads.length})`, icon: Users },
    { key: 'activity', label: `Activity (${activities.length})`, icon: Activity },
    { key: 'conversions', label: `Conversions (${conversions.length})`, icon: TrendingUp },
    { key: 'payouts', label: `Payouts (${payouts.length})`, icon: Send },
  ];

  const previewCommission =
    commissionEnabled && conversionAmount && commissionPercentage
      ? (parseFloat(conversionAmount || '0') * parseFloat(commissionPercentage || '0')) / 100
      : 0;

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || null;
  const selectedLeadConversionCount = selectedLeadId
    ? conversions.filter((conversion) => conversion.lead_id === selectedLeadId).length
    : 0;
  const selectedLeadNextConversionNumber = selectedLeadConversionCount + 1;

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-emmy-primary to-blue-700 p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-1/2 h-40 w-40 rounded-full bg-yellow-400/20 blur-2xl" />

        <button
          onClick={() => router.push('/admin/ambassadors')}
          className="relative mb-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to ambassadors
        </button>

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_560px] xl:items-end">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/15 text-4xl font-bold shadow-lg">
              {ambassador.avatar_url ? (
                <img src={ambassador.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                ambassador.name[0]?.toUpperCase() || 'U'
              )}
            </div>

            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">
                  {ambassador.name}
                </h1>
                <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                  {ambassador.status}
                </span>
              </div>

              <p className="break-all text-lg text-blue-100">{ambassador.ambassador_tag}</p>
              <p className="mt-1 break-all text-sm text-blue-100">{ambassador.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="Leads" value={String(ambassador.total_leads)} />
            <HeroStat label="Conversions" value={String(ambassador.total_conversions)} />
            <HeroStat label="Balance" value={formatCurrency(ambassador.available_balance)} />
            <HeroStat label="Paid Out" value={formatCurrency(ambassador.total_cashed_out)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setShowAddLead(true)} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Add Lead
        </Button>
        <Button onClick={() => setShowAddConversion(true)} variant="outline" className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Add Conversion
        </Button>
        <Button onClick={() => setShowPayout(true)} variant="outline" className="gap-2 rounded-xl">
          <Send className="h-4 w-4" /> Send Payout
        </Button>
        <Button onClick={() => setShowBonus(true)} variant="outline" className="gap-2 rounded-xl">
          <Gift className="h-4 w-4" /> Add Bonus
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-emmy-primary text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Profile Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <Info label="Email" value={ambassador.email} />
                <Info label="Phone" value={ambassador.whatsapp_number || 'Not provided'} />
                <Info
                  label="Date of Birth"
                  value={
                    ambassador.date_of_birth
                      ? formatDate(ambassador.date_of_birth)
                      : 'Not provided'
                  }
                />
                <Info label="Referral Code" value={ambassador.referral_code} />
                <Info label="Custom Code" value={ambassador.custom_referral_code || 'Not set'} />
                <Info label="Joined" value={formatDate(ambassador.created_at)} />
                <Info label="Status" value={ambassador.status} />
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Financial Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Summary icon={DollarSign} label="Available Balance" value={formatCurrency(ambassador.available_balance)} />
                <Summary icon={Send} label="Total Paid Out" value={formatCurrency(ambassador.total_cashed_out)} />
                <Summary icon={TrendingUp} label="Conversions" value={String(ambassador.total_conversions)} />
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Payout Account Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <Info label="Bank Name" value={ambassador.bank_name || 'Not provided'} />
                <Info
                  label="Account Number"
                  value={ambassador.bank_account_number || 'Not provided'}
                />
                <Info
                  label="Account Name"
                  value={ambassador.bank_account_name || 'Not provided'}
                />
                <Info
                  label="Payout Status"
                  value={
                    ambassador.bank_name &&
                    ambassador.bank_account_number &&
                    ambassador.bank_account_name
                      ? 'Complete'
                      : 'Incomplete'
                  }
                />
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emmy-primary" />
                Admin Controls
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Current Status</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-lg font-bold capitalize">{ambassador.status}</p>
                  <Badge variant={ambassador.status === 'active' ? 'default' : 'secondary'}>
                    {ambassador.status}
                  </Badge>
                </div>
              </div>

              {ambassador.status === 'active' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() => updateAmbassadorStatus('suspended')}
                  className="w-full gap-2 rounded-xl"
                >
                  <PauseCircle className="h-4 w-4" />
                  Pause Ambassador
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() => updateAmbassadorStatus('active')}
                  className="w-full gap-2 rounded-xl"
                >
                  <PlayCircle className="h-4 w-4" />
                  Reactivate Ambassador
                </Button>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Delete Options
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Soft delete hides this ambassador while keeping their
                      records. Hard delete permanently removes the ambassador
                      and all linked data.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={softDeleteAmbassador}
                    className="group flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
                        <Trash2 className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Soft Delete Ambassador
                        </p>
                        <p className="text-xs leading-5 text-amber-700">
                          Hide from active list, but keep history and allow
                          restoration later.
                        </p>
                      </div>
                    </div>

                    <span className="ml-3 text-lg font-semibold text-amber-600 transition group-hover:translate-x-1">
                      →
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={hardDeleteAmbassador}
                    className="group flex w-full items-center justify-between rounded-xl bg-red-600 p-4 text-left text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
                        <Trash2 className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="text-sm font-semibold">
                          Hard Delete Permanently
                        </p>
                        <p className="text-xs leading-5 text-red-100">
                          Permanently erase this ambassador and all related
                          records.
                        </p>
                      </div>
                    </div>

                    <span className="ml-3 text-lg font-semibold text-white transition group-hover:translate-x-1">
                      →
                    </span>
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs leading-5 text-blue-700">
                    Choose carefully. Soft delete can be restored. Hard delete
                    cannot be undone.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'leads' && (
        <List empty="No leads yet">
          {leads.map((lead) => (
            <Row key={lead.id} title={lead.customer_name || 'Unnamed lead'} subtitle={lead.customer_phone || 'No phone'} badge={lead.status} />
          ))}
        </List>
      )}

      {activeTab === 'activity' && (
        <List empty="No activity yet">
          {activities.map((act) => (
            <Row key={act.id} title={act.platform} subtitle={act.post_url} badge={act.status} />
          ))}
        </List>
      )}

      {activeTab === 'conversions' && (
        <Card className="rounded-3xl border-0 shadow-sm">
          <CardContent className="p-0">
            {conversions.length === 0 ? (
              <p className="p-10 text-center text-slate-500">No conversions yet</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {conversions.map((conv) => {
                  const percentage =
                    conv.commission_percentage ??
                    (conv.commission_rate ? conv.commission_rate * 100 : null);

                  const isCommissionable = conv.is_commissionable !== false;
                  const sequence = conv.conversion_sequence || 1;

                  return (
                    <div key={conv.id} className="p-5 hover:bg-slate-50">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              Conversion #{sequence}
                            </p>

                            {conv.is_repeat_conversion && (
                              <Badge variant="secondary">Repeat</Badge>
                            )}

                            {conv.admin_attention_required && (
                              <Badge variant="warning">Review needed</Badge>
                            )}

                            {!isCommissionable && (
                              <Badge variant="outline">No commission</Badge>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {formatDate(conv.approved_at)}
                          </p>

                          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <p>
                              <span className="text-slate-500">Sale Amount:</span>{' '}
                              <strong>{formatCurrency(conv.amount)}</strong>
                            </p>

                            <p>
                              <span className="text-slate-500">Commission:</span>{' '}
                              <strong>{formatCurrency(conv.commission_amount || 0)}</strong>
                              {percentage !== null && isCommissionable ? ` (${percentage}%)` : ''}
                            </p>
                          </div>

                          {conv.admin_attention_required && (
                            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                              This repeat conversion was saved without ambassador commission.
                              Review whether commission should be added.
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-bold text-emmy-primary">
                            {formatCurrency(conv.amount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {isCommissionable ? 'Commission applied' : 'No commission'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'payouts' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Payout History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {payouts.length === 0 ? (
                <p className="p-10 text-center text-slate-500">No payouts yet</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {payouts.map((pay) => (
                    <Row
                      key={pay.id}
                      title={formatCurrency(pay.amount)}
                      subtitle={pay.notes || 'Payout processed'}
                      badge={pay.status}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Bonus History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bonuses.length === 0 ? (
                <p className="p-10 text-center text-slate-500">No bonuses yet</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {bonuses.map((bonus) => (
                    <Row
                      key={bonus.id}
                      title={formatCurrency(bonus.amount)}
                      subtitle={bonus.reason || 'Bonus added'}
                      badge={formatDate(bonus.created_at)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showAddLead && (
        <Modal title="Add Lead">
          <Input placeholder="Customer Name" value={leadName} onChange={(e) => setLeadName(e.target.value)} />
          <Input placeholder="Phone Number" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} />
          <Input placeholder="Email optional" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} />
          <Textarea placeholder="Notes optional" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={handleAddLead} disabled={addingLead || !leadName || !leadPhone}>
              {addingLead ? 'Adding...' : 'Add Lead'}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddLead(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {showAddConversion && (
        <Modal title="Add Conversion">
          <select
            className="w-full rounded-md border p-2"
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
          >
            <option value="">Select a lead</option>
            {leads.map((lead) => {
              const leadConversionCount = conversions.filter(
                (conversion) => conversion.lead_id === lead.id
              ).length;

              return (
                <option key={lead.id} value={lead.id}>
                  {lead.customer_name || 'Unnamed lead'} - {lead.customer_phone || 'No phone'}
                  {leadConversionCount > 0 ? ` (${leadConversionCount} previous conversion${leadConversionCount > 1 ? 's' : ''})` : ''}
                </option>
              );
            })}
          </select>

          {selectedLead && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">
                {selectedLead.customer_name || 'Unnamed lead'}
              </p>
              <p className="text-slate-500">{selectedLead.customer_phone || 'No phone'}</p>
              <p className="mt-1 text-xs text-slate-500">
                This will be conversion #{selectedLeadNextConversionNumber}.
                {selectedLeadConversionCount > 0
                  ? ' This is a repeat conversion for this lead.'
                  : ' This is the first conversion for this lead.'}
              </p>
            </div>
          )}

          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Sale Amount"
            value={conversionAmount}
            onChange={(e) => setConversionAmount(e.target.value)}
          />

          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={commissionEnabled}
                onChange={(e) => setCommissionEnabled(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-semibold text-slate-900">
                  Add ambassador commission
                </span>
                <span className="block text-xs text-slate-500">
                  Untick this for repeat sales where the ambassador should not receive commission.
                </span>
              </span>
            </label>

            {commissionEnabled ? (
              <div className="space-y-2">
                <div className="relative">
                  <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Commission Percentage e.g. 5, 13.74, 15"
                    value={commissionPercentage}
                    onChange={(e) => setCommissionPercentage(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Estimated commission:{' '}
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(Number.isFinite(previewCommission) ? previewCommission : 0)}
                  </span>
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                No commission will be added. If this is a repeat conversion, it will be flagged for admin review.
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleAddConversion}
              disabled={
                addingConversion ||
                !selectedLeadId ||
                !conversionAmount ||
                (commissionEnabled && !commissionPercentage)
              }
            >
              {addingConversion ? 'Adding...' : 'Add Conversion'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddConversion(false);
                setCommissionEnabled(true);
              }}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {showPayout && (
        <Modal title="Send Payout">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
            Current available balance: <strong>{formatCurrency(ambassador.available_balance)}</strong>
          </div>

          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Payout amount"
            value={payoutAmount}
            onChange={(e) => setPayoutAmount(e.target.value)}
          />

          <Textarea
            placeholder="Payout note optional"
            value={payoutNotes}
            onChange={(e) => setPayoutNotes(e.target.value)}
          />

          <div className="flex gap-2">
            <Button onClick={handlePayout} disabled={processingPayout || !payoutAmount}>
              {processingPayout ? 'Processing...' : 'Send Payout'}
            </Button>
            <Button variant="ghost" onClick={() => setShowPayout(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {showBonus && (
        <Modal title="Add Bonus">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Bonus amount"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
          />

          <Textarea
            placeholder="Reason for bonus"
            value={bonusReason}
            onChange={(e) => setBonusReason(e.target.value)}
          />

          <div className="flex gap-2">
            <Button onClick={handleAddBonus} disabled={addingBonus || !bonusAmount}>
              {addingBonus ? 'Adding...' : 'Add Bonus'}
            </Button>
            <Button variant="ghost" onClick={() => setShowBonus(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 p-4 backdrop-blur">
      <p className="truncate text-sm text-blue-100">{label}</p>
      <p className="mt-1 break-words text-xl font-bold leading-tight sm:text-2xl">
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <Icon className="mb-3 h-5 w-5 text-emmy-primary" />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function List({
  children,
  empty,
}: {
  children: React.ReactNode;
  empty: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardContent className="p-0">
        {hasChildren ? (
          <div className="divide-y divide-slate-100">{children}</div>
        ) : (
          <p className="p-10 text-center text-slate-500">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <div className="flex items-center justify-between p-5 hover:bg-slate-50">
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="break-all text-sm text-slate-500">{subtitle}</p>
      </div>
      <Badge variant="secondary">{badge}</Badge>
    </div>
  );
}

function Modal({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
