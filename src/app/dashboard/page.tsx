'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  MessageCircle,
  MousePointerClick,
  Plus,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

interface AmbassadorData {
  id: string;
  name: string;
  ambassador_tag: string;
  referral_code: string;
  custom_referral_code: string | null;
  whatsapp_link: string;
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
  const [spinLink, setSpinLink] = useState('');
  const [spinStats, setSpinStats] = useState({
    uniqueVisitors: 0,
    qualifiedLeads: 0,
  });

  useEffect(() => {
    async function fetchData() {
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

          const code =
            formattedAmbassador.custom_referral_code || formattedAmbassador.referral_code;

          setAmbassador(formattedAmbassador);
          setReferralLink(`https://ambassador.emmytechnology.com/r/${code}`);

          const configuredSpinOrigin = process.env.NEXT_PUBLIC_SPIN_WHEEL_URL?.replace(
            /\/$/,
            ''
          );
          const isLocalBrowser = ['localhost', '127.0.0.1'].includes(
            window.location.hostname
          );
          const spinOrigin =
            configuredSpinOrigin ||
            (isLocalBrowser
              ? 'http://127.0.0.1:3000'
              : 'https://spinwheel.emmytechnology.com');
          setSpinLink(`${spinOrigin}/a/${encodeURIComponent(code)}`);

          const [{ count }, { data: spinRows, error: spinError }] =
            await Promise.all([
              supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('ambassador_id', ambData.id)
                .is('merged_into_lead_id', null),
              supabase
                .from('ambassador_spin_attributions')
                .select('visitor_id, credited_as_lead')
                .eq('ambassador_id', ambData.id),
            ]);

          setActualLeads(count || 0);

          if (spinError) {
            console.error('Unable to load Spin Wheel attribution stats:', spinError);
          } else {
            const rows = spinRows || [];
            setSpinStats({
              uniqueVisitors: rows.length,
              qualifiedLeads: rows.filter((row) => row.credited_as_lead).length,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching ambassador dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const conversionRate = useMemo(() => {
    if (!ambassador || actualLeads === 0) return 0;
    return Math.min(100, Math.round((ambassador.total_conversions / actualLeads) * 100));
  }, [ambassador, actualLeads]);

  function copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1800);
  }

  function shareOnWhatsApp(link: string, message: string) {
    const text = encodeURIComponent(`${message}: ${link}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-28 animate-pulse rounded-3xl bg-slate-200/60" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!ambassador) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="p-8 text-center">
          <p className="font-medium text-slate-700">No ambassador profile was found.</p>
          <p className="mt-1 text-sm text-slate-500">Please contact an administrator.</p>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    {
      label: 'Total Leads',
      value: actualLeads.toLocaleString(),
      detail: 'People referred',
      icon: Users,
      iconClass: 'bg-blue-50 text-emmy-primary',
    },
    {
      label: 'Conversions',
      value: ambassador.total_conversions.toLocaleString(),
      detail: `${conversionRate}% conversion rate`,
      icon: TrendingUp,
      iconClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Available Balance',
      value: `₦${Number(ambassador.available_balance || 0).toLocaleString('en-NG')}`,
      detail: 'Ready for payout',
      icon: Wallet,
      iconClass: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Total Paid',
      value: `₦${Number(ambassador.total_cashed_out || 0).toLocaleString('en-NG')}`,
      detail: 'Lifetime earnings paid',
      icon: CreditCard,
      iconClass: 'bg-violet-50 text-violet-600',
    },
  ];

  const quickActions = [
    {
      label: 'Submit activity',
      description: 'Add a social post for review',
      href: '/dashboard/activity',
      icon: Plus,
    },
    {
      label: 'Review your leads',
      description: 'See progress and follow-ups',
      href: '/dashboard/leads',
      icon: MessageCircle,
    },
    {
      label: 'View leaderboard',
      description: 'Compare your performance',
      href: '/dashboard/leaderboard',
      icon: Trophy,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emmy-primary">Welcome back</p>
            <Badge
              variant={ambassador.status === 'active' ? 'success' : 'warning'}
              className="capitalize"
            >
              {ambassador.status}
            </Badge>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-slate-950 sm:text-3xl">
            {ambassador.name}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Track your referrals, share your link and focus on the next action that grows your earnings.
          </p>
        </div>

        <Link href="/dashboard/payouts">
          <Button variant="outline" className="w-full sm:w-auto">
            View payouts
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-emmy-primary via-emmy-primary to-emmy-primary-dark text-white shadow-[0_18px_45px_rgba(0,51,153,0.2)]">
          <CardContent className="relative p-5 sm:p-7">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/[0.08]" />
            <div className="absolute -bottom-24 right-20 h-52 w-52 rounded-full border border-white/10" />

            <div className="relative">
              <div className="flex items-center gap-2 text-blue-100">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                  Your referral links
                </span>
              </div>

              <h3 className="mt-3 max-w-xl text-2xl font-bold tracking-[-0.03em] sm:text-[28px]">
                Share the right experience for every audience.
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/[0.80]">
                Your store link supports product referrals. Your Spin Wheel link turns completed registrations into attributed leads automatically.
              </p>

              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl border border-white/[0.12] bg-white/10 p-4 backdrop-blur-sm sm:flex sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-blue-100/70">
                      Store referral link
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-white">{referralLink}</p>
                  </div>

                  <div className="mt-3 flex gap-2 sm:mt-0">
                    <button
                      onClick={() => copyToClipboard(referralLink, 'store-link')}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-emmy-primary transition hover:bg-blue-50"
                    >
                      {copied === 'store-link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied === 'store-link' ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() =>
                        shareOnWhatsApp(
                          referralLink,
                          'Shop with EmmyTech through my personal referral link'
                        )
                      }
                      className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/[0.15]"
                      aria-label="Share store referral link"
                      title="Share store referral link"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.12] p-4 backdrop-blur-sm">
                  <div className="sm:flex sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <MousePointerClick className="h-4 w-4 text-amber-300" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-100">
                          Personal Spin Wheel link
                        </p>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-white">{spinLink}</p>
                      <p className="mt-1 text-xs text-blue-100/70">
                        A lead is credited after the visitor completes registration.
                      </p>
                    </div>

                    <div className="mt-3 flex gap-2 sm:mt-0">
                      <button
                        onClick={() => copyToClipboard(spinLink, 'spin-link')}
                        disabled={!spinLink}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {copied === 'spin-link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied === 'spin-link' ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() =>
                          shareOnWhatsApp(
                            spinLink,
                            'Use my EmmyTech Spin Wheel link to register and claim your free spin'
                          )
                        }
                        disabled={!spinLink}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-amber-200/30 bg-white/10 text-white transition hover:bg-white/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Share personal Spin Wheel link"
                        title="Share personal Spin Wheel link"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                    <div>
                      <p className="text-xl font-bold text-white">{spinStats.uniqueVisitors}</p>
                      <p className="mt-0.5 text-[11px] text-blue-100/65">Unique spin visitors</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-white">{spinStats.qualifiedLeads}</p>
                      <p className="mt-0.5 text-[11px] text-blue-100/65">Credited spin leads</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-xs text-blue-100/60">
                Ambassador code: {ambassador.custom_referral_code || ambassador.referral_code}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Performance pulse</p>
                <p className="mt-1 text-xs text-slate-500">Lead-to-sale effectiveness</p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <Target className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tracking-[-0.04em] text-slate-950">{conversionRate}%</p>
                <p className="mt-1 text-xs text-slate-500">Current conversion rate</p>
              </div>
              <span className="text-xs font-semibold text-emerald-600">
                {ambassador.total_conversions} sales
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${conversionRate}%` }}
              />
            </div>

            <Link
              href="/dashboard/leads"
              className="mt-6 inline-flex items-center text-sm font-semibold text-emmy-primary hover:underline"
            >
              Open lead pipeline
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="transition hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500 sm:text-sm">{stat.label}</p>
                    <p className="mt-2 truncate text-xl font-bold tracking-[-0.035em] text-slate-950 sm:text-2xl">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${stat.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-400 sm:text-xs">{stat.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.72fr]">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-950">Next best actions</h3>
                <p className="mt-1 text-sm text-slate-500">Keep your momentum moving.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-emmy-primary/20 hover:bg-blue-50/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emmy-primary shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emmy-primary" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-900">{action.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{action.description}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-950">Referral identity</h3>
                <p className="mt-1 text-sm text-slate-500">Use these details consistently.</p>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-300" />
            </div>

            <div className="mt-5 space-y-3">
              {[
                { label: 'Ambassador tag', value: ambassador.ambassador_tag, key: 'tag' },
                {
                  label: 'Referral code',
                  value: ambassador.custom_referral_code || ambassador.referral_code,
                  key: 'code',
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {item.label}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">{item.value}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(item.value, item.key)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:text-emmy-primary"
                    aria-label={`Copy ${item.label}`}
                  >
                    {copied === item.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
