import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { buildFunnel } from '@/lib/funnel/funnel.ts';
import { loadFunnelData } from '@/lib/funnel/load.ts';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  // The middleware only guards /dashboard pages, so this route proves who is calling itself.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401, headers: noStore });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'ambassador') return NextResponse.json({ error: 'Ambassador access only.' }, { status: 403, headers: noStore });

  // The ambassador id always comes from the session, never from the request.
  const { data: ambassador } = await supabase.from('ambassadors').select('id').eq('user_id', user.id).maybeSingle();
  if (!ambassador) return NextResponse.json({ error: 'Ambassador profile not found.' }, { status: 404, headers: noStore });

  try {
    const { raw, unmatchedLeads } = await loadFunnelData(ambassador.id);
    return NextResponse.json({ people: buildFunnel(raw), meta: { unmatchedLeads } }, { headers: noStore });
  } catch (error) {
    console.error('Ambassador funnel failed:', error);
    return NextResponse.json({ error: 'Unable to load your funnel right now.' }, { status: 500, headers: noStore });
  }
}
