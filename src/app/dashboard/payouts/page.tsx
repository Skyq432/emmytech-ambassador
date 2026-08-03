'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';

interface Payout {
  id: string;
  amount: number;
  points_paid: number;
  status: string;
  paid_at: string;
  notes: string | null;
}

interface AmbassadorStats {
  id: string;
  total_points: number;
  total_cashed_out: number;
  available_balance: number;
}

export default function AmbassadorPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<AmbassadorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const { range } = useReportingPeriod();

  useEffect(() => {
    fetchData();
  }, [range.startIso, range.endExclusiveIso]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get ambassador data with id
      const { data: ambData } = await supabase
        .from('ambassadors')
        .select('id, total_points, total_cashed_out, available_balance')
        .eq('user_id', user.id)
        .single();

      if (ambData) setStats(ambData);

      // Get payouts using the ambassador id
      const { data: payData } = await supabase
        .from('payouts')
        .select('*')
        .eq('ambassador_id', ambData?.id)
        .gte('created_at', range.startIso)
        .lt('created_at', range.endExclusiveIso)
        .order('created_at', { ascending: false });

      setPayouts(payData || []);
    } catch (err) {
      console.error('Error fetching payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  const periodCashedOut = payouts
    .filter((payout) => payout.status === 'paid')
    .reduce((total, payout) => total + Number(payout.amount || 0), 0);

  const periodPointsPaid = payouts
    .filter((payout) => payout.status === 'paid')
    .reduce((total, payout) => total + Number(payout.points_paid || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emmy-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payouts</h1>
        <p className="text-muted-foreground">Track your earnings and payout history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emmy-primary/10 rounded-lg">
                <Wallet className="h-5 w-5 text-emmy-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(stats?.available_balance || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emmy-secondary/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-emmy-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cashed Out in Period</p>
                <p className="text-2xl font-bold">{formatCurrency(periodCashedOut)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Points Paid in Period</p>
                <p className="text-2xl font-bold">{periodPointsPaid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payout History */}
      <Card>
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payouts yet. Keep earning points!
            </div>
          ) : (
            <div className="space-y-3">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="font-bold text-lg">{formatCurrency(payout.amount)}</p>
                    <p className="text-sm text-muted-foreground">{payout.points_paid} points redeemed</p>
                    {payout.notes && <p className="text-sm text-muted-foreground">{payout.notes}</p>}
                  </div>
                  <div className="text-right">
                    <Badge variant={payout.status === 'paid' ? 'default' : 'secondary'}>
                      {payout.status}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(payout.paid_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}