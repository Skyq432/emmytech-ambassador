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
  Award,
  Shield,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';

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
  total_points: number;
  total_leads: number;
  total_conversions: number;
  total_cashed_out: number;
  available_balance: number;
  status: string;
  created_at: string;
}

interface Lead {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: string;
  created_at: string;
}

interface PostActivity {
  id: string;
  platform: string;
  post_url: string;
  status: string;
  points_awarded: number;
  submitted_at: string;
}

interface Conversion {
  id: string;
  amount: number;
  commission_amount: number;
  approved_at: string;
}

interface Payout {
  id: string;
  amount: number;
  points_paid: number;
  status: string;
  paid_at: string;
  notes: string | null;
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
  const [addingConversion, setAddingConversion] = useState(false);

  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutPoints, setPayoutPoints] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [processingPayout, setProcessingPayout] = useState(false);

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
      'SOFT DELETE\n\nThis will hide this ambassador from the active ambassador list and stop them from using the dashboard, but their leads, points, conversions, payout history and referral history will remain in the database.\n\nYou can restore them later by changing their status back to active.\n\nContinue?'
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
    setAddingConversion(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('admin_create_conversion', {
        p_admin_id: session.user.id,
        p_lead_id: selectedLeadId,
        p_amount: parseFloat(conversionAmount),
      });

      if (error) throw error;

      setSelectedLeadId('');
      setConversionAmount('');
      setShowAddConversion(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingConversion(false);
    }
  };

  const handlePayout = async () => {
    if (!payoutAmount || !payoutPoints) return;
    setProcessingPayout(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('process_payout', {
        p_admin_id: session.user.id,
        p_ambassador_id: ambassadorId,
        p_points_paid: parseInt(payoutPoints),
        p_amount: parseFloat(payoutAmount),
        p_notes: payoutNotes || null,
      });

      if (error) throw error;

      setPayoutAmount('');
      setPayoutPoints('');
      setPayoutNotes('');
      setShowPayout(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessingPayout(false);
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

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/15 text-4xl font-bold shadow-lg">
              {ambassador.avatar_url ? (
                <img src={ambassador.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                ambassador.name[0]?.toUpperCase() || 'U'
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight">{ambassador.name}</h1>
                <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                  {ambassador.status}
                </span>
              </div>

              <p className="text-lg text-blue-100">{ambassador.ambassador_tag}</p>
              <p className="mt-1 text-sm text-blue-100">{ambassador.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="text-sm text-blue-100">Points</p>
              <p className="text-2xl font-bold">{formatNumber(ambassador.total_points)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="text-sm text-blue-100">Leads</p>
              <p className="text-2xl font-bold">{ambassador.total_leads}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="text-sm text-blue-100">Conversions</p>
              <p className="text-2xl font-bold">{ambassador.total_conversions}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="text-sm text-blue-100">Balance</p>
              <p className="text-2xl font-bold">{formatCurrency(ambassador.available_balance)}</p>
            </div>
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
                <Info label="Phone" value={ambassador.whatsapp_number} />
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
                <Summary icon={DollarSign} label="Available" value={formatCurrency(ambassador.available_balance)} />
                <Summary icon={Send} label="Cashed Out" value={formatCurrency(ambassador.total_cashed_out)} />
                <Summary icon={Award} label="Total Points" value={formatNumber(ambassador.total_points)} />
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

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-2 flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Delete options</p>
                    <p className="text-xs text-amber-700">
                      Soft delete hides the ambassador. Hard delete permanently erases the ambassador and all linked data.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={softDeleteAmbassador}
                    className="w-full gap-2 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Soft Delete Ambassador
                  </Button>

                  <Button
                    type="button"
                    variant="danger"
                    disabled={actionLoading}
                    onClick={hardDeleteAmbassador}
                    className="w-full gap-2 rounded-xl"
                  >
                    <Trash2 className="h-4 w-4" />
                    Hard Delete Permanently
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'leads' && (
        <List empty="No leads yet">
          {leads.map((lead) => (
            <Row key={lead.id} title={lead.customer_name} subtitle={lead.customer_phone} badge={lead.status} />
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
        <List empty="No conversions yet">
          {conversions.map((conv) => (
            <Row
              key={conv.id}
              title={formatCurrency(conv.amount)}
              subtitle={`Commission: ${formatCurrency(conv.commission_amount)}`}
              badge={formatDate(conv.approved_at)}
            />
          ))}
        </List>
      )}

      {activeTab === 'payouts' && (
        <List empty="No payouts yet">
          {payouts.map((pay) => (
            <Row
              key={pay.id}
              title={formatCurrency(pay.amount)}
              subtitle={`${pay.points_paid} points paid`}
              badge={pay.status}
            />
          ))}
        </List>
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
            {leads.filter((l) => l.status !== 'converted').map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.customer_name} - {lead.customer_phone}
              </option>
            ))}
          </select>
          <Input type="number" placeholder="Sale Amount" value={conversionAmount} onChange={(e) => setConversionAmount(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={handleAddConversion} disabled={addingConversion || !selectedLeadId || !conversionAmount}>
              {addingConversion ? 'Adding...' : 'Add Conversion'}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddConversion(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {showPayout && (
        <Modal title="Send Payout">
          <Input type="number" placeholder="Amount" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
          <Input type="number" placeholder="Points to Deduct" value={payoutPoints} onChange={(e) => setPayoutPoints(e.target.value)} />
          <Textarea placeholder="Notes optional" value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={handlePayout} disabled={processingPayout || !payoutAmount || !payoutPoints}>
              {processingPayout ? 'Processing...' : 'Send Payout'}
            </Button>
            <Button variant="ghost" onClick={() => setShowPayout(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900 break-words">{value}</p>
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
        <p className="text-sm text-slate-500 break-all">{subtitle}</p>
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
