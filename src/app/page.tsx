import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, TrendingUp, Users } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface Ambassador {
  id: string;
  user_id: string;
  ambassador_tag: string;
  referral_code: string;
  whatsapp_number: string | null;
  whatsapp_link: string | null;
  bio: string | null;
  social_links: any | null;
  total_points: number;
  total_leads: number | null;
  total_conversions: number | null;
  status: string;
  created_at: string;
}

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  ambassador_tag: string;
  total_points: number;
  total_leads: number;
  total_conversions: number;
}

export default async function LeaderboardPage() {
  try {
    const supabase = await createServerClient();

    // Server-side check: if no user, redirect to login before rendering anything
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!user) {
      redirect('/auth/login');
    }

    // Fetch leaderboard entries server-side
    const { data, error } = await supabase
      .from('ambassadors')
      .select('*, users(name)')
      .order('total_points', { ascending: false })
      .limit(50);

    if (error) throw error;

    const ranked = (data || []).map((entry: any, index: number) => ({
      rank: index + 1,
      user_id: entry.user_id,
      full_name: entry.users?.name || entry.ambassador_tag || 'Unknown',
      ambassador_tag: entry.ambassador_tag,
      total_points: entry.total_points || 0,
      total_leads: entry.total_leads || 0,
      total_conversions: entry.total_conversions || 0,
    }));

    // Find current user's rank
    const myRank = ranked.find((e) => e.user_id === user.id) || null;

    const entries = ranked;

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 2: return <Medal className="h-6 w-6 text-gray-400" />;
      case 3: return <Award className="h-6 w-6 text-amber-600" />;
      default: return <span className="text-lg font-bold text-muted-foreground w-6 text-center">#{rank}</span>;
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-yellow-50 border-yellow-200';
      case 2: return 'bg-gray-50 border-gray-200';
      case 3: return 'bg-amber-50 border-amber-200';
      default: return '';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground">Top performing ambassadors this month</p>
        </div>

        {/* My Rank Card */}
        {myRank && (
          <Card className="bg-emmy-primary/5 border-emmy-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-emmy-primary flex items-center justify-center text-white font-bold text-lg">
                    #{myRank.rank}
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Your Position</p>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(myRank.total_points)} points
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    <span>{myRank.total_leads} leads</span>
                    <span>•</span>
                    <span>{myRank.total_conversions} conversions</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top 3 Podium */}
        {entries.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 items-end">
            {[1, 0, 2].map((index) => {
              const entry = entries[index];
              if (!entry) return null;
              const heights = ['h-32', 'h-40', 'h-32'];
              const positions = ['2nd', '1st', '3rd'];
              return (
                <Card key={entry.user_id} className={`${getRankStyle(entry.rank)} ${heights[index]}`}>
                  <CardContent className="p-4 text-center h-full flex flex-col justify-between">
                    <div>
                      <div className="h-12 w-12 mx-auto mb-2 rounded-full bg-emmy-primary/10 flex items-center justify-center text-emmy-primary font-bold">
                        {getInitials(entry.full_name)}
                      </div>
                      <p className="font-semibold text-sm truncate">{entry.full_name}</p>
                      <p className="text-xs text-muted-foreground">{entry.ambassador_tag}</p>
                      <p className="text-xs text-muted-foreground">{positions[index]}</p>
                    </div>
                    <p className="text-lg font-bold">{formatNumber(entry.total_points)} pts</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Full List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Rankings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {entries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No ambassadors on the leaderboard yet
              </div>
            ) : (
              <div className="divide-y">
                {entries.map((entry) => (
                  <div 
                    key={entry.user_id} 
                    className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${
                      entry.user_id === myRank?.user_id ? 'bg-emmy-primary/5' : ''
                    }`}
                  >
                    <div className="w-12 flex justify-center">
                      {getRankIcon(entry.rank)}
                    </div>

                    <div className="h-10 w-10 rounded-full bg-emmy-primary/10 flex items-center justify-center text-emmy-primary font-bold text-sm">
                      {getInitials(entry.full_name)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{entry.full_name}</p>
                      <p className="text-xs text-muted-foreground">{entry.ambassador_tag}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{entry.total_leads} leads</span>
                        <span>{entry.total_conversions} conversions</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-lg">{formatNumber(entry.total_points)}</p>
                      <p className="text-xs text-muted-foreground">points</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } catch (err: any) {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
        <p className="text-red-600">Error loading leaderboard: {err?.message || String(err)}</p>
      </div>
    );
  }
}