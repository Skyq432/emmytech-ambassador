import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const FALLBACK_WHATSAPP_LINK =
  'https://wa.me/2348146503700?text=Hello%20EmmyTech%2C%20I%20want%20to%20make%20an%20enquiry.';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const cleanCode = decodeURIComponent(code).trim();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('Missing Supabase environment variables.');
      return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      null;

    const userAgent = request.headers.get('user-agent') || null;

    const { data: ambassador, error: ambassadorError } = await supabase
      .from('ambassadors')
      .select('id, referral_code, custom_referral_code, status, whatsapp_link')
      .or(
        `referral_code.ilike.${cleanCode},custom_referral_code.ilike.${cleanCode}`
      )
      .eq('status', 'active')
      .maybeSingle();

    if (ambassadorError) {
      console.error('Ambassador lookup failed:', ambassadorError.message);
      return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
    }

    if (!ambassador) {
      console.error('No active ambassador found for referral code:', cleanCode);
      return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
    }

    const referralCodeToTrack =
      ambassador.custom_referral_code || ambassador.referral_code || cleanCode;

    const { error: rpcError } = await supabase.rpc(
      'track_whatsapp_referral_click',
      {
        p_referral_code: referralCodeToTrack,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
      }
    );

    if (rpcError) {
      console.error('Referral tracking RPC failed:', rpcError.message);
    }

    return NextResponse.redirect(
      ambassador.whatsapp_link || FALLBACK_WHATSAPP_LINK
    );
  } catch (error: any) {
    console.error('Referral route failed:', error?.message || error);
    return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
  }
}