'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, POINT_VALUES } from '@/lib/utils';
import { Phone, Mail, User, Calendar } from 'lucide-react';

interface Lead {
  id: string;
  ambassador_id: string;
  source: string | null;
  source_detail: any | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  referral_code_used: string | null;
  whatsapp_link_used: string | null;
  status: 'pending' | 'contacted' | 'converted' | 'lost';
  notes: string | null;
  assigned_admin: string | null;
  created_at: string;
  updated_at: string | null;
}

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'info';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, converted: 0, pending: 0, totalPoints: 0 });

  useEffect(() => {
    async function fetchLeads() {
      try {
        const supabase = createClient();

        // Get current session instead of getUser to avoid RLS recursion
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('ambassador_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setLeads(data || []);

        // Calculate stats
        const converted = data?.filter(l => l.status === 'converted').length || 0;
        const pending = data?.filter(l => l.status === 'pending').length || 0;
        const totalPoints = data?.reduce((sum, l) => {
          if (l.status === 'converted') return sum + POINT_VALUES.conversion;
          if (l.status === 'contacted') return sum + POINT_VALUES.lead;
          return sum;
        }, 0) || 0;

        setStats({
          total: data?.length || 0,
          converted,
          pending,
          totalPoints,
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchLeads();
  }, []);

  const getStatusBadge = (status: Lead['status']) => {
    const variants: { pending: BadgeVariant; contacted: BadgeVariant; converted: BadgeVariant; lost: BadgeVariant } = {
      pending: 'warning',
      contacted: 'info',
      converted: 'success',
      lost: 'danger',
    };
    return (
      <Badge variant={variants[status]}>
        {status}
      </Badge>
    );
  };

  const getPointsForStatus = (status: Lead['status']) => {
    switch (status) {
      case 'converted': return POINT_VALUES.conversion;
      case 'contacted': return POINT_VALUES.lead;
      default: return 0;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded animate-pulse" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-4 w-full bg-slate-200 rounded animate-pulse mb-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-600">Error loading leads: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Leads</h1>
        <p className="text-muted-foreground">Customers who clicked your WhatsApp link</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Leads</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Converted</p>
            <p className="text-2xl font-bold text-emmy-secondary">{stats.converted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Points Earned</p>
            <p className="text-2xl font-bold text-emmy-primary">+{stats.totalPoints}</p>
          </CardContent>
        </Card>
      </div>

      {/* Leads List */}
      <div className="space-y-4">
        {leads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No leads yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Share your WhatsApp link to start receiving leads!
              </p>
            </CardContent>
          </Card>
        ) : (
          leads.map((lead) => (
            <Card key={lead.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emmy-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-emmy-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{lead.customer_name || 'Anonymous'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(lead.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {lead.customer_phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <a href={`tel:${lead.customer_phone}`} className="hover:text-emmy-primary">
                            {lead.customer_phone}
                          </a>
                        </div>
                      )}
                      {lead.customer_email && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          <a href={`mailto:${lead.customer_email}`} className="hover:text-emmy-primary">
                            {lead.customer_email}
                          </a>
                        </div>
                      )}
                      {lead.source && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>Source: {lead.source}</span>
                        </div>
                      )}
                      {lead.referral_code_used && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>Ref: {lead.referral_code_used}</span>
                        </div>
                      )}
                    </div>

                    {lead.notes && (
                      <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                        {lead.notes}
                      </p>
                    )}
                  </div>

                  <div className="text-right space-y-2">
                    {getStatusBadge(lead.status)}
                    {lead.status !== 'pending' && lead.status !== 'lost' && (
                      <Badge variant="outline" className="text-emmy-secondary block">
                        +{getPointsForStatus(lead.status)} pts
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}