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
  ArrowLeft, User, Trophy, Users, TrendingUp, MessageCircle,
  DollarSign, Phone, Link2, Globe, Calendar, Plus, Send,
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

interface Activity {
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

  const [ambassador, setAmbassador] = useState<AmbassadorDetail | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'activity' | 'conversions' | 'payouts'>('overview');

  // Add lead form
  const [showAddLead, setShowAddLead] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [addingLead, setAddingLead] = useState(false);

  // Add conversion form
  const [showAddConversion, setShowAddConversion] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [conversionAmount, setConversionAmount] = useState('');
  const [addingConversion, setAddingConversion] = useState(false);

  // Payout form
  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutPoints, setPayoutPoints] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [processingPayout, setProcessingPayout] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (ambassadorId) fetchData();
  }, [ambassadorId]);

  const fetchData = async () => {
    try {
      // Fetch ambassador with user data
      const { data: ambData } = await supabase
        .from('ambassadors')
        .select('*, users(name, email, avatar_url, created_at)')
        .eq('id', ambassadorId)
        .single();

      if (ambData) {
        setAmbassador({
          ...ambData,
          name: ambData.users?.name || 'Unknown',
          email: ambData.users?.email || '',
          avatar_url: ambData.users?.avatar_url,
          created_at: ambData.users?.created_at,
        });
      }

      // Fetch leads
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('created_at', { ascending: false });
      setLeads(leadsData || []);

      // Fetch activities
      const { data: actData } = await supabase
        .from('activities')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('submitted_at', { ascending: false });
      setActivities(actData || []);

      // Fetch conversions
      const { data: convData } = await supabase
        .from('conversions')
        .select('*')
        .eq('ambassador_id', ambassadorId)
        .order('approved_at', { ascending: false });
      setConversions(convData || []);

      // Fetch payouts
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

  const handleAddLead = async () => {
    if (!leadName || !leadPhone) return;
    setAddingLead(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('admin_create_lead', {
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('admin_create_conversion', {
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('process_payout', {
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emmy-primary"></div>
      </div>
    );
  }

  if (!ambassador) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Ambassador not found</p>
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: User },
    { key: 'leads', label: `Leads (${leads.length})`, icon: Users },
    { key: 'activity', label: `Activity (${activities.length})`, icon: TrendingUp },
    { key: 'conversions', label: `Conversions (${conversions.length})`, icon: DollarSign },
    { key: 'payouts', label: `Payouts (${payouts.length})`, icon: Send },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/ambassadors')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{ambassador.name}</h1>
          <p className="text-muted-foreground">{ambassador.ambassador_tag}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Points</p>
            <p className="text-2xl font-bold">{formatNumber(ambassador.total_points)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Leads</p>
            <p className="text-2xl font-bold">{ambassador.total_leads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Conversions</p>
            <p className="text-2xl font-bold">{ambassador.total_conversions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-2xl font-bold">{formatCurrency(ambassador.available_balance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowAddLead(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Lead
        </Button>
        <Button onClick={() => setShowAddConversion(true)} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> Add Conversion
        </Button>
        <Button onClick={() => setShowPayout(true)} variant="outline" className="gap-2">
          <Send className="h-4 w-4" /> Send Payout
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emmy-primary text-emmy-primary'
                  : 'border-transparent text-muted-foreground hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{ambassador.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{ambassador.whatsapp_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Referral Code</p>
                  <p className="font-medium">{ambassador.referral_code}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Custom Code</p>
                  <p className="font-medium">{ambassador.custom_referral_code || 'Not set'}</p>
                </div>
              </div>
              {ambassador.bio && (
                <div>
                  <p className="text-sm text-muted-foreground">Bio</p>
                  <p className="text-sm">{ambassador.bio}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">WhatsApp Link</p>
                <a href={ambassador.whatsapp_link} target="_blank" className="text-sm text-emmy-primary hover:underline">
                  {ambassador.whatsapp_link}
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold">{formatCurrency(ambassador.available_balance)}</p>
                  <p className="text-sm text-muted-foreground">Available</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold">{formatCurrency(ambassador.total_cashed_out)}</p>
                  <p className="text-sm text-muted-foreground">Total Cashed Out</p>
                </div>
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <p className="text-2xl font-bold">{formatNumber(ambassador.total_points)}</p>
                  <p className="text-sm text-muted-foreground">Total Points</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'leads' && (
        <div className="space-y-4">
          {leads.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No leads yet</p>
          ) : (
            leads.map((lead) => (
              <Card key={lead.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{lead.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{lead.customer_phone}</p>
                    {lead.customer_email && <p className="text-sm text-muted-foreground">{lead.customer_email}</p>}
                  </div>
                  <Badge variant={lead.status === 'converted' ? 'default' : 'secondary'}>{lead.status}</Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No activity yet</p>
          ) : (
            activities.map((act) => (
              <Card key={act.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{act.platform}</p>
                    <p className="text-sm text-muted-foreground">{act.post_url}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={act.status === 'approved' ? 'default' : 'secondary'}>{act.status}</Badge>
                    {act.points_awarded > 0 && <p className="text-sm text-emmy-secondary mt-1">+{act.points_awarded} pts</p>}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'conversions' && (
        <div className="space-y-4">
          {conversions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No conversions yet</p>
          ) : (
            conversions.map((conv) => (
              <Card key={conv.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{formatCurrency(conv.amount)}</p>
                    <p className="text-sm text-muted-foreground">Commission: {formatCurrency(conv.commission_amount)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{formatDate(conv.approved_at)}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="space-y-4">
          {payouts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No payouts yet</p>
          ) : (
            payouts.map((pay) => (
              <Card key={pay.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{formatCurrency(pay.amount)}</p>
                    <p className="text-sm text-muted-foreground">{pay.points_paid} points paid</p>
                    {pay.notes && <p className="text-sm text-muted-foreground">{pay.notes}</p>}
                  </div>
                  <div className="text-right">
                    <Badge variant={pay.status === 'paid' ? 'default' : 'secondary'}>{pay.status}</Badge>
                    <p className="text-sm text-muted-foreground">{formatDate(pay.paid_at)}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Add Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Customer Name" value={leadName} onChange={(e) => setLeadName(e.target.value)} />
              <Input placeholder="Phone Number" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} />
              <Input placeholder="Email (optional)" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} />
              <Textarea placeholder="Notes (optional)" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button onClick={handleAddLead} disabled={addingLead || !leadName || !leadPhone}>
                  {addingLead ? 'Adding...' : 'Add Lead'}
                </Button>
                <Button variant="ghost" onClick={() => setShowAddLead(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Conversion Modal */}
      {showAddConversion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Add Conversion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className="w-full p-2 border rounded-md"
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
              >
                <option value="">Select a lead</option>
                {leads.filter(l => l.status !== 'converted').map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.customer_name} - {lead.customer_phone}</option>
                ))}
              </select>
              <Input
                type="number"
                placeholder="Sale Amount (₦)"
                value={conversionAmount}
                onChange={(e) => setConversionAmount(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={handleAddConversion} disabled={addingConversion || !selectedLeadId || !conversionAmount}>
                  {addingConversion ? 'Adding...' : 'Add Conversion'}
                </Button>
                <Button variant="ghost" onClick={() => setShowAddConversion(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payout Modal */}
      {showPayout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Send Payout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-xl font-bold">{formatCurrency(ambassador.available_balance)}</p>
              </div>
              <Input
                type="number"
                placeholder="Amount (₦)"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Points to Deduct"
                value={payoutPoints}
                onChange={(e) => setPayoutPoints(e.target.value)}
              />
              <Textarea
                placeholder="Notes (optional)"
                value={payoutNotes}
                onChange={(e) => setPayoutNotes(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button onClick={handlePayout} disabled={processingPayout || !payoutAmount || !payoutPoints}>
                  {processingPayout ? 'Processing...' : 'Send Payout'}
                </Button>
                <Button variant="ghost" onClick={() => setShowPayout(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}