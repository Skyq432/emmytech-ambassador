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
    .filter((a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.ambassador_tag.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emmy-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ambassadors</h1>
          <p className="text-muted-foreground">
            Manage and track all ambassadors.
          </p>
        </div>

        <Link href="/admin/invite">
          <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Invite New
          </Button>
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ambassadors..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          {[
            { key: 'total_points' as SortField, label: 'Points' },
            { key: 'total_leads' as SortField, label: 'Leads' },
            { key: 'total_conversions' as SortField, label: 'Conversions' },
            { key: 'available_balance' as SortField, label: 'Balance' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No ambassadors found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((amb) => (
            <Card
              key={amb.id}
              className="group hover:shadow-lg hover:shadow-emmy-primary/5 transition-all duration-300 border-slate-200/60"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-emmy-primary text-white flex items-center justify-center text-sm font-bold border-2 border-slate-100 overflow-hidden">
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

                    <div>
                      <p className="font-semibold text-sm">{amb.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {amb.ambassador_tag}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={amb.status === 'active' ? 'default' : 'secondary'}
                  >
                    {amb.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs text-muted-foreground">
                        Points
                      </span>
                    </div>
                    <p className="font-bold text-sm mt-0.5">
                      {formatNumber(amb.total_points)}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-xs text-muted-foreground">
                        Leads
                      </span>
                    </div>
                    <p className="font-bold text-sm mt-0.5">
                      {amb.total_leads}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">
                        Conversions
                      </span>
                    </div>
                    <p className="font-bold text-sm mt-0.5">
                      {amb.total_conversions}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs text-muted-foreground">
                        Balance
                      </span>
                    </div>
                    <p className="font-bold text-sm mt-0.5">
                      {formatCurrency(amb.available_balance)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Cashed out: {formatCurrency(amb.total_cashed_out)}
                  </p>

                  <Link href={`/admin/ambassadors/${amb.id}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-emmy-primary hover:text-emmy-primary hover:bg-emmy-primary/5"
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