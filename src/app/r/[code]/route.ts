import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const FALLBACK_WHATSAPP_LINK =
  'https://wa.me/2348146503700?text=Hello%20EmmyTech%2C%20I%20want%20to%20make%20an%20enquiry.';

async function writeRouteLog(
  supabase: ReturnType<typeof createClient>,
  code: string,
  step: string,
  message: string,
  data: Record<string, any> = {}
) {
  try {
    await supabase.from('referral_route_logs').insert({
      code,
      step,
      message,
      data,
    });
  } catch {
    // Do not block redirect if logging fails.
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cleanCode = decodeURIComponent(code).trim();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    await writeRouteLog(supabase, cleanCode, 'route_started', 'Referral route started');

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      null;

    const userAgent = request.headers.get('user-agent') || null;

    await writeRouteLog(supabase, cleanCode, 'request_info', 'Captured request info', {
      ipAddress,
      userAgent,
    });

    const { data: ambassador, error: ambassadorError } = await supabase
      .from('ambassadors')
      .select('id, referral_code, custom_referral_code, status, whatsapp_link')
      .or(
        `referral_code.ilike.${cleanCode},custom_referral_code.ilike.${cleanCode}`
      )
      .eq('status', 'active')
      .maybeSingle();

    if (ambassadorError) {
      await writeRouteLog(supabase, cleanCode, 'ambassador_error', ambassadorError.message);
      return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
    }

    if (!ambassador) {
      await writeRouteLog(supabase, cleanCode, 'ambassador_not_found', 'No active ambassador found');
      return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
    }

    await writeRouteLog(supabase, cleanCode, 'ambassador_found', 'Active ambassador found', {
      ambassador_id: ambassador.id,
      referral_code: ambassador.referral_code,
      custom_referral_code: ambassador.custom_referral_code,
    });

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
      await writeRouteLog(supabase, cleanCode, 'rpc_error', rpcError.message, {
        details: rpcError,
      });
    } else {
      await writeRouteLog(supabase, cleanCode, 'rpc_success', 'Referral click tracked successfully');
    }

    return NextResponse.redirect(
      ambassador.whatsapp_link || FALLBACK_WHATSAPP_LINK
    );
  } catch (error: any) {
    await writeRouteLog(
      supabase,
      cleanCode,
      'route_failed',
      error?.message || 'Unknown route error'
    );

    return NextResponse.redirect(FALLBACK_WHATSAPP_LINK);
  }
}