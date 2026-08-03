'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  CheckCircle, DollarSign, TrendingUp, 
  Calendar, Search, ArrowLeft, ChevronRight, Inbox
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';

interface Conversion {
  id: string;
  lead_id: string;
  ambassador_id: string;
  ambassador_name: string;
  customer_phone: string;
  amount: number;
  commission_amount: number;
  commission_rate: number;
  status: 'pending' | 'approved';
  approved_by: string | null;
  approved_at: string | null;
}

export default function ConversionsPage() {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');

  const { range } = useReportingPeriod();

  useEffect(() => {
    async function fetchConversions() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('conversions')
          .select('*, ambassadors(id, users(name)), leads(customer_phone)')
          .gte('approved_at', range.startIso)
          .lt('approved_at', range.endExclusiveIso)
          .order('approved_at', { ascending: false });

        if (error) throw error;

        const formatted: Conversion[] = (data || []).map((c: any) => ({
          id: c.id,
          lead_id: c.lead_id,
          ambassador_id: c.ambassador_id,
          ambassador_name: c.ambassadors?.users?.name || 'Unknown',
          customer_phone: c.leads?.customer_phone || 'Unknown',
          amount: c.amount || 0,
          commission_amount: c.commission_amount || 0,
          commission_rate: c.commission_rate || 0.05,
          status: c.approved_by ? 'approved' : 'pending',
          approved_by: c.approved_by,
          approved_at: c.approved_at,
        }));

        setConversions(formatted);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchConversions();
  }, [range.startIso, range.endExclusiveIso]);

  const filtered = conversions.filter(c => {
    const matchesSearch = c.ambassador_name.toLowerCase().includes(search.toLowerCase()) || 
                         c.customer_phone.includes(search);
    const matchesFilter = filter === 'all' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  const totalPending = conversions.filter(c => c.status === 'pending').length;
  const totalApproved = conversions.filter(c => c.status === 'approved').length;
  const totalRevenue = conversions.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0);
  const totalCommission = conversions.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.commission_amount, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
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
      {/* Header with back button */}
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
          <span className="text-slate-900 font-medium">Conversions</span>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">Conversions</h1>
        <p className="text-slate-500 mt-1">Approve sales and manage commissions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalPending}</p>
                <p className="text-sm text-slate-500">Pending Approval</p>
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
                <p className="text-2xl font-bold text-slate-900">{totalApproved}</p>
                <p className="text-sm text-slate-500">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue)}</p>
                <p className="text-sm text-slate-500">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalCommission)}</p>
                <p className="text-sm text-slate-500">Total Commission</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search conversions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-slate-200"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved'] as const).map((f) => (
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

      {/* Conversions List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-12 text-center">
              <Inbox className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900">No conversions yet</h3>
              <p className="text-slate-500 mt-2">Conversions will appear here when leads are converted</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((conversion) => (
            <Card key={conversion.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-semibold text-slate-900">Conversion #{conversion.id.slice(0, 8)}</span>
                      <Badge className={conversion.status === 'approved' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0' : 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-0'}>
                        {conversion.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Ambassador</p>
                        <p className="font-medium text-slate-900">{conversion.ambassador_name}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Customer</p>
                        <p className="font-medium text-slate-900">{conversion.customer_phone}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Amount</p>
                        <p className="font-medium text-blue-600">{formatCurrency(conversion.amount)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Commission ({(conversion.commission_rate * 100).toFixed(0)}%)</p>
                        <p className="font-medium text-cyan-600">{formatCurrency(conversion.commission_amount)}</p>
                      </div>
                    </div>

                    {conversion.approved_at && (
                      <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span>Approved: {formatDate(conversion.approved_at)}</span>
                      </div>
                    )}
                  </div>

                  {conversion.status === 'pending' && (
                    <div className="flex flex-col gap-2 ml-6">
                      <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}