'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Medal, Award, Users, TrendingUp } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';

interface LeaderboardEntry {
  rank: number;
  id: string;
  full_name: string;
  total_leads: number;
  total_conversions: number;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const { range } = useReportingPeriod();

  useEffect(() => {
    async function fetchLeaderboard() {
      const supabase = createClient();

      const [ambassadorsResponse, leadsResponse, conversionsResponse] =
        await Promise.all([
          supabase
            .from('ambassadors')
            .select(
              `
                id,
                ambassador_tag,
                status,
                users(name)
              `
            )
            .eq('status', 'active'),
          supabase
            .from('leads')
            .select('ambassador_id')
            .eq('approved_as_lead', true)
            .is('merged_into_lead_id', null)
            .gte('created_at', range.startIso)
            .lt('created_at', range.endExclusiveIso),
          supabase
            .from('conversions')
            .select('ambassador_id')
            .gte('approved_at', range.startIso)
            .lt('approved_at', range.endExclusiveIso),
        ]);

      const firstError =
        ambassadorsResponse.error ||
        leadsResponse.error ||
        conversionsResponse.error;

      if (firstError) {
        console.error('Error loading leaderboard:', firstError);
        setEntries([]);
        setLoading(false);
        return;
      }

      const leadCounts = new Map<string, number>();
      for (const lead of leadsResponse.data || []) {
        if (!lead.ambassador_id) continue;
        leadCounts.set(
          lead.ambassador_id,
          (leadCounts.get(lead.ambassador_id) || 0) + 1
        );
      }

      const conversionCounts = new Map<string, number>();
      for (const conversion of conversionsResponse.data || []) {
        if (!conversion.ambassador_id) continue;
        conversionCounts.set(
          conversion.ambassador_id,
          (conversionCounts.get(conversion.ambassador_id) || 0) + 1
        );
      }

      const ranked = (ambassadorsResponse.data || [])
        .map((entry: any) => ({
          rank: 0,
          id: entry.id,
          full_name:
            entry.users?.name || entry.ambassador_tag || 'Ambassador',
          total_leads: leadCounts.get(entry.id) || 0,
          total_conversions: conversionCounts.get(entry.id) || 0,
        }))
        .filter(
          (entry) =>
            entry.total_leads > 0 || entry.total_conversions > 0
        )
        .sort(
          (a, b) =>
            b.total_leads - a.total_leads ||
            b.total_conversions - a.total_conversions
        )
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

      setEntries(ranked);
      setLoading(false);
    }

    setLoading(true);
    fetchLeaderboard();
  }, [range.startIso, range.endExclusiveIso]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading leaderboard...</p>
      </div>
    );
  }

  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">
          Ambassador ranking by leads first, then conversions for the selected period.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">
            No ambassadors on the leaderboard yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {topThree.map((entry) => (
              <TopRankCard key={entry.id} entry={entry} />
            ))}
          </div>

          <Card className="overflow-hidden rounded-2xl border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {(rest.length > 0 ? rest : entries).map((entry) => (
                  <LeaderboardRow key={entry.id} entry={entry} />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TopRankCard({ entry }: { entry: LeaderboardEntry }) {
  const Icon = entry.rank === 1 ? Trophy : entry.rank === 2 ? Medal : Award;

  return (
    <Card className="rounded-2xl border-0 bg-white shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:text-center">
          <div className="flex items-center gap-3 sm:flex-col">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                entry.rank === 1
                  ? 'bg-yellow-100'
                  : entry.rank === 2
                    ? 'bg-slate-100'
                    : 'bg-amber-100'
              }`}
            >
              <Icon
                className={`h-6 w-6 ${
                  entry.rank === 1
                    ? 'text-yellow-600'
                    : entry.rank === 2
                      ? 'text-slate-500'
                      : 'text-amber-600'
                }`}
              />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Rank #{entry.rank}
              </p>
              <p className="truncate font-semibold text-slate-900">
                {entry.full_name}
              </p>
            </div>
          </div>

          <div className="text-right sm:text-center">
            <p className="text-xl font-bold text-emmy-primary">
              {formatNumber(entry.total_leads)}
            </p>
            <p className="text-xs text-slate-500">
              leads · {formatNumber(entry.total_conversions)} conversions
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50 sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 sm:h-11 sm:w-11">
          #{entry.rank}
        </div>

        <p className="truncate font-semibold text-slate-900">
          {entry.full_name}
        </p>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-4 text-right">
        <div>
          <div className="flex items-center justify-end gap-1 text-emmy-primary">
            <Users className="h-4 w-4" />
            <p className="text-lg font-bold sm:text-xl">
              {formatNumber(entry.total_leads)}
            </p>
          </div>
          <p className="text-xs text-slate-500">leads</p>
        </div>

        <div>
          <div className="flex items-center justify-end gap-1 text-emerald-600">
            <TrendingUp className="h-4 w-4" />
            <p className="text-lg font-bold sm:text-xl">
              {formatNumber(entry.total_conversions)}
            </p>
          </div>
          <p className="text-xs text-slate-500">conversions</p>
        </div>
      </div>
    </div>
  );
}
