'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Users, Search, Plus, Edit, Trash2, 
  CheckCircle, XCircle, Hash, Link2, Clock, ArrowLeft, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

interface Ambassador {
  id: string;
  user_id: string;
  name: string;
  email: string;
  ambassador_tag: string;
  referral_code: string;
  whatsapp_number: string | null;
  whatsapp_link: string | null;
  status: 'active' | 'pending' | 'suspended';
  total_leads: number;
  total_conversions: number;
  total_points: number;
  created_at: string;
}

export default function AmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'suspended'>('all');

  useEffect(() => {
    async function fetchAmbassadors() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('ambassadors')
          .select('*, users(name, email)')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formatted: Ambassador[] = (data || []).map((a: any) => ({
          id: a.id,
          user_id: a.user_id,
          name: a.users?.name || 'Unknown',
          email: a.users?.email || '',
          ambassador_tag: a.ambassador_tag,
          referral_code: a.referral_code,
          whatsapp_number: a.whatsapp_number,
          whatsapp_link: a.whatsapp_link,
          status: a.status,
          total_leads: a.total_leads || 0,
          total_conversions: a.total_conversions || 0,
          total_points: a.total_points || 0,
          created_at: a.created_at,
        }));

        setAmbassadors(formatted);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAmbassadors();
  }, []);

  const filtered = ambassadors.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) || 
                         a.email.toLowerCase().includes(search.toLowerCase()) ||
                         a.ambassador_tag.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || a.status === filter;
    return matchesSearch && matchesFilter;
  });

  const totalActive = ambassadors.filter(a => a.status === 'active').length;
  const totalPending = ambassadors.filter(a => a.status === 'pending').length;
  const totalSuspended = ambassadors.filter(a => a.status === 'suspended').length;

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
          <span className="text-slate-900 font-medium">Ambassadors</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Ambassadors</h1>
          <p className="text-slate-500 mt-1">Manage all ambassador accounts</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Ambassador
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{ambassadors.length}</p>
                <p className="text-sm text-slate-500">Total</p>
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
                <p className="text-2xl font-bold text-slate-900">{totalActive}</p>
                <p className="text-sm text-slate-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalPending}</p>
                <p className="text-sm text-slate-500">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalSuspended}</p>
                <p className="text-sm text-slate-500">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search ambassadors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-slate-200"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'pending', 'suspended'] as const).map((f) => (
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
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Ambassador</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Tag & Code</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Performance</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Status</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Joined</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="font-semibold text-white">{a.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{a.name}</p>
                          <p className="text-xs text-slate-500">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs">
                          <Hash className="w-3 h-3 text-blue-500" />
                          <span className="text-blue-600 font-medium">{a.ambassador_tag}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <Link2 className="w-3 h-3 text-cyan-500" />
                          <span className="text-cyan-600 font-medium">{a.referral_code}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1 text-xs">
                        <p><span className="text-slate-500">Leads:</span> <span className="font-medium">{a.total_leads}</span></p>
                        <p><span className="text-slate-500">Conversions:</span> <span className="font-medium">{a.total_conversions}</span></p>
                        <p><span className="text-slate-500">Points:</span> <span className="font-medium text-blue-600">{a.total_points.toLocaleString()}</span></p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge className={a.status === 'active' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0' : a.status === 'pending' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-0' : 'bg-red-100 text-red-700 hover:bg-red-100 border-0'}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-sm text-slate-500">{formatDate(a.created_at)}</span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}