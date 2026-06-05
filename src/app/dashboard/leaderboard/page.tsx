'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface LeaderboardEntry {
  rank: number;
  id: string;
  full_name: string;
  total_points: number;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('ambassadors')
        .select(`
          id,
          ambassador_tag,
          total_points,
          status,
          users(name)
        `)
        .neq('status', 'deleted')
        .order('total_points', { ascending: false });

      if (error) {
        console.error('Error loading leaderboard:', error);
        setEntries([]);
        setLoading(false);
        return;
      }

      const ranked = (data || []).map((entry: any, index: number) => ({
        rank: index + 1,
        id: entry.id,
        full_name:
          entry.users?.name ||
          entry.ambassador_tag ||
          'Ambassador',
        total_points: entry.total_points || 0,
      }));

      setEntries(ranked);
      setLoading(false);
    }

    fetchLeaderboard();
  }, []);

  if (loading) {
    return <p className="text-slate-500">Loading leaderboard...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Leaderboard</h1>
        <p className="text-slate-500">Ambassador ranking by points</p>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No ambassadors on the leaderboard yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                      {entry.rank === 1 ? (
                        <Trophy className="h-5 w-5 text-yellow-500" />
                      ) : (
                        entry.rank
                      )}
                    </div>

                    <p className="font-semibold text-slate-900">
                      {entry.full_name}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold text-emmy-primary">
                      {formatNumber(entry.total_points)}
                    </p>
                    <p className="text-xs text-slate-500">points</p>
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