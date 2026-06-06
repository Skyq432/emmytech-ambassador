'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Eye,
  DollarSign,
  UserPlus,
  TrendingUp,
  Users,
  Award,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import Link from 'next/link';

interface Ambassador {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  ambassador_tag: string;
  total_points: number;
  total_leads: number;
  total_conversions: number;
  available_balance: number;
  total_cashed_out: number;
  status: string;
  created_at: string;
}

type SortField =
  | 'total_points'
  | 'total_leads'
  | 'total_conversions'
  | 'available_balance';

export default function AdminAmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('total_points');

  const supabase = createClient();

  useEffect(() => {
    fetchAmbassadors();
  }, []);

  const fetchAmbassadors = async () => {
    try {
      const { data, error } = await supabase
        .from('ambassadors')
        .select('*, users(name, email, avatar_url)')
        .neq('status', 'deleted')
        .order('total_points', { ascending: false });

      if (error) throw error;

      setAmbassadors(
        (data || []).map((a: any) => ({
          ...a,
          name: a.users?.name || 'Unknown',
          email: a.users?.email || '',
          avatar_url: a.users?.avatar_url,
        }))
      );
    } catch (err) {
      console.error('Error loading ambassadors:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = ambassadors
    .filter((a) => {
      const q = search.toLowerCase();

      return (
        a.name.toLowerCase().includes(q) ||
        a.ambassador_tag.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emmy-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Ambassadors
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Manage and track all ambassadors.
          </p>
        </div>

        <Link href="/admin/invite" className="w-full sm:w-auto">
          <Button className="w-full gap-2 sm:w-auto">
            <UserPlus className="h-4 w-4" />
            Invite New
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ambassadors..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'total_points' as SortField, label: 'Points' },
            { key: 'total_leads' as SortField, label: 'Leads' },
            { key: 'total_conversions' as SortField, label: 'Conversions' },
            { key: 'available_balance' as SortField, label: 'Balance' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                sortBy === s.key
                  ? 'bg-emmy-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-muted-foreground">
            No ambassadors found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((amb) => (
            <Card
              key={amb.id}
              className="group rounded-2xl border-slate-200/70 transition-all duration-300 hover:shadow-lg hover:shadow-emmy-primary/5"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-slate-100 bg-emmy-primary text-sm font-bold text-white">
                      {amb.avatar_url ? (
                        <img
                          src={amb.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        amb.name[0]?.toUpperCase() || 'U'
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {amb.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {amb.ambassador_tag}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {amb.email}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={amb.status === 'active' ? 'default' : 'secondary'}
                    className="shrink-0"
                  >
                    {amb.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric
                    icon={Award}
                    label="Points"
                    value={formatNumber(amb.total_points)}
                    iconClass="text-amber-500"
                  />

                  <Metric
                    icon={Users}
                    label="Leads"
                    value={String(amb.total_leads || 0)}
                    iconClass="text-blue-500"
                  />

                  <Metric
                    icon={TrendingUp}
                    label="Conversions"
                    value={String(amb.total_conversions || 0)}
                    iconClass="text-emerald-500"
                  />

                  <Metric
                    icon={DollarSign}
                    label="Balance"
                    value={formatCurrency(amb.available_balance)}
                    iconClass="text-violet-500"
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Cashed out: {formatCurrency(amb.total_cashed_out)}
                  </p>

                  <Link href={`/admin/ambassadors/${amb.id}`} className="w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-1 text-emmy-primary hover:bg-emmy-primary/5 hover:text-emmy-primary sm:w-auto"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: any;
  label: string;
  value: string;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>

      <p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}