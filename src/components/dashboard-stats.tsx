'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, TrendingUp, DollarSign, Wallet, ArrowUpRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface DashboardStatsProps {
  totalPoints: number;
  totalLeads: number;
  totalConversions: number;
  availableBalance: number;
  totalCashedOut: number;
}

export function DashboardStats({ totalPoints, totalLeads, totalConversions, availableBalance, totalCashedOut }: DashboardStatsProps) {
  const stats = [
    {
      label: 'Total Points',
      value: formatNumber(totalPoints),
      sub: 'Lifetime points earned',
      icon: Trophy,
      color: 'from-yellow-500/20 to-amber-500/10',
      textColor: 'text-amber-600',
      borderColor: 'border-amber-200/50',
    },
    {
      label: 'Total Leads',
      value: totalLeads.toString(),
      sub: 'All time referrals',
      icon: Users,
      color: 'from-blue-500/20 to-cyan-500/10',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-200/50',
    },
    {
      label: 'Conversions',
      value: totalConversions.toString(),
      sub: 'Completed sales',
      icon: TrendingUp,
      color: 'from-emerald-500/20 to-green-500/10',
      textColor: 'text-emerald-600',
      borderColor: 'border-emerald-200/50',
    },
    {
      label: 'Available Balance',
      value: formatCurrency(availableBalance),
      sub: 'Ready to cash out',
      icon: Wallet,
      color: 'from-violet-500/20 to-purple-500/10',
      textColor: 'text-violet-600',
      borderColor: 'border-violet-200/50',
      highlight: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card
            key={stat.label}
            className={`
              relative overflow-hidden border ${stat.borderColor} 
              hover:shadow-lg hover:shadow-${stat.textColor.split('-')[1]}-500/10 
              transition-all duration-300 group
              ${stat.highlight ? 'ring-2 ring-violet-500/20' : ''}
            `}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-50`} />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-xl bg-white/80 backdrop-blur-sm shadow-sm ${stat.textColor}`}>
                  <Icon className="h-5 w-5" />
                </div>
                {stat.highlight && (
                  <Badge variant="secondary" className="bg-violet-100 text-violet-700 text-xs">
                    Cash Out
                  </Badge>
                )}
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm font-medium text-slate-600 mt-0.5">{stat.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </div>
              <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight className={`h-5 w-5 ${stat.textColor}`} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function CashOutSummary({ totalCashedOut, availableBalance }: { totalCashedOut: number; availableBalance: number }) {
  return (
    <Card className="border-emerald-200/50">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5" />
      <CardContent className="relative p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">Total Cashed Out</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalCashedOut)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="text-lg font-semibold text-emerald-600">{formatCurrency(availableBalance)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}