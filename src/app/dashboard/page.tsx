'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  Users,
  TrendingUp,
  MessageCircle,
  Copy,
  CheckCircle,
  Share2,
  Plus,
  ArrowRight,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';

interface AmbassadorData {
  id: string;
  name: string;
  ambassador_tag: string;
  referral_code: string;
  custom_referral_code: string | null;
  whatsapp_link: string;
  total_points: number;
  total_leads: number;
  total_conversions: number;
  available_balance: number;
  total_cashed_out: number;
  status: string;
}

export default function AmbassadorDashboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null);
  const [actualLeads, setActualLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const buildReferralLink = (ambData: AmbassadorData) => {
    const code = ambData.custom_referral_code || ambData.referral_code;

    if (typeof window === 'undefined') {
      return `/r/${code}`;
    }

    return `${window.location.origin}/r/${code}`;
  };

  const fetchData = async () => {
    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: ambData } = await supabase
        .from('ambassadors')
        .select('*, users(name)')
        .eq('user_id', user.id)
        .single();

      if (ambData) {
        const formattedAmbassador: AmbassadorData = {
          ...ambData,
          name: ambData.users?.name || 'Ambassador',
        };

        setAmbassador(formattedAmbassador);
        setReferralLink(buildReferralLink(formattedAmbassador));

        const { count: leadsCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('ambassador_id', ambData.id);

        setActualLeads(leadsCount || 0);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emmy-primary" />
      </div>
    );
  }

  if (!ambassador) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500">
          No ambassador data found. Please contact admin.
        </p>
      </div>
    );
  }

  const stats = [
    {
      label: 'Points',
      value: ambassador.total_points.toLocaleString(),
      icon: Trophy,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Leads',
      value: actualLeads.toString(),
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Conversions',
      value: ambassador.total_conversions.toString(),
      icon: TrendingUp,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Balance',
      value: `₦${(ambassador.available_balance || 0).toLocaleString()}`,
      icon: DollarSign,
      color: 'bg-violet-50 text-violet-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back,{' '}
            <span className="text-emmy-primary">{ambassador.name}</span>!
          </h1>
          <p className="mt-1 text-slate-500">
            Here is what is happening with your ambassador activity
          </p>
        </div>

        <Badge variant="secondary">{ambassador.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card key={stat.label} className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {stat.value}
                    </p>
                  </div>

                  <div className={`rounded-lg p-2 ${stat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Share2 className="h-5 w-5 text-emmy-primary" />
            <h3 className="font-semibold">Your Referral Assets</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Tag
                </p>
                <code className="text-lg font-bold text-emmy-primary">
                  {ambassador.ambassador_tag}
                </code>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(ambassador.ambassador_tag, 'tag')
                }
              >
                {copied === 'tag' ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Code
                </p>
                <code className="text-lg font-bold text-emmy-secondary">
                  {ambassador.custom_referral_code || ambassador.referral_code}
                </code>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(
                    ambassador.custom_referral_code || ambassador.referral_code,
                    'code'
                  )
                }
              >
                {copied === 'code' ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Referral Link
                </p>
                <p className="truncate text-sm text-slate-700">
                  {referralLink}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(referralLink, 'link')}
              >
                {copied === 'link' ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Submit Post',
            href: '/dashboard/activity/new',
            icon: Plus,
            color: 'bg-emmy-primary text-white',
          },
          {
            label: 'View Activity',
            href: '/dashboard/activity',
            icon: Share2,
            color: 'bg-slate-100 text-slate-700',
          },
          {
            label: 'View Leads',
            href: '/dashboard/leads',
            icon: MessageCircle,
            color: 'bg-slate-100 text-slate-700',
          },
          {
            label: 'Leaderboard',
            href: '/dashboard/leaderboard',
            icon: Trophy,
            color: 'bg-slate-100 text-slate-700',
          },
        ].map((action) => {
          const Icon = action.icon;

          return (
            <Link key={action.href} href={action.href}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${action.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium">{action.label}</span>
                  </div>

                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}