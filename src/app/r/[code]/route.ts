import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const VISITOR_COOKIE_NAME = 'emmytech_visitor_id';

const FALLBACK_WHATSAPP_LINK =
  'https://wa.me/2348146503700?text=Hello%20EmmyTech%2C%20I%20want%20to%20make%20an%20enquiry.';

function createVisitorId() {
  return crypto.randomUUID();
}

async function writeRouteLog(
  supabase: any,
  code: string,
  step: string,
  message: string,
  data: Record<string, any> = {}
) {
  try {
    await supabase.from('referral_route_logs').insert([
      {
        code,
        step,
        message,
        data,
      },
    ]);
  } catch {
    // Logging must never block the WhatsApp redirect.
  }
}

function redirectWithVisitorCookie(url: string, visitorId: string) {
  const response = NextResponse.redirect(url);

  response.cookies.set({
    name: VISITOR_COOKIE_NAME,
    value: visitorId,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cleanCode = decodeURIComponent(code).trim().toLowerCase();

  const existingVisitorId = request.cookies.get(VISITOR_COOKIE_NAME)?.value;
  const visitorId = existingVisitorId || createVisitorId();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return redirectWithVisitorCookie(FALLBACK_WHATSAPP_LINK, visitorId);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    await writeRouteLog(
      supabase,
      cleanCode,
      'route_started',
      'Referral route started',
      {
        visitor_id: visitorId,
        had_existing_cookie: Boolean(existingVisitorId),
      }
    );

    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      null;

    const userAgent = request.headers.get('user-agent') || null;

    await writeRouteLog(
      supabase,
      cleanCode,
      'request_info',
      'Captured request info',
      {
        ipAddress,
        userAgent,
        visitor_id: visitorId,
      }
    );

    const { data: ambassadors, error: ambassadorError } = await supabase
      .from('ambassadors')
      .select('id, referral_code, custom_referral_code, status, whatsapp_link')
      .eq('status', 'active');

    if (ambassadorError) {
      await writeRouteLog(
        supabase,
        cleanCode,
        'ambassador_error',
        ambassadorError.message
      );

      return redirectWithVisitorCookie(FALLBACK_WHATSAPP_LINK, visitorId);
    }

    const ambassador = (ambassadors || []).find((item: any) => {
      const referralCode = String(item.referral_code || '').trim().toLowerCase();
      const customCode = String(item.custom_referral_code || '')
        .trim()
        .toLowerCase();

      return referralCode === cleanCode || customCode === cleanCode;
    });

    if (!ambassador) {
      await writeRouteLog(
        supabase,
        cleanCode,
        'ambassador_not_found',
        'No active ambassador found',
        {
          active_ambassadors_checked: ambassadors?.length || 0,
          visitor_id: visitorId,
        }
      );

      return redirectWithVisitorCookie(FALLBACK_WHATSAPP_LINK, visitorId);
    }

    await writeRouteLog(
      supabase,
      cleanCode,
      'ambassador_found',
      'Active ambassador found',
      {
        ambassador_id: ambassador.id,
        referral_code: ambassador.referral_code,
        custom_referral_code: ambassador.custom_referral_code,
        visitor_id: visitorId,
      }
    );

    const referralCodeToTrack =
      ambassador.custom_referral_code || ambassador.referral_code || cleanCode;

    const { error: rpcError } = await supabase.rpc(
      'track_whatsapp_referral_click_v2',
      {
        p_referral_code: referralCodeToTrack,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_visitor_id: visitorId,
      }
    );

    if (rpcError) {
      await writeRouteLog(
        supabase,
        cleanCode,
        'rpc_error',
        rpcError.message,
        {
          details: rpcError,
          referral_code_to_track: referralCodeToTrack,
          visitor_id: visitorId,
        }
      );
    } else {
      await writeRouteLog(
        supabase,
        cleanCode,
        'rpc_success',
        'Referral click tracked successfully',
        {
          referral_code_to_track: referralCodeToTrack,
          visitor_id: visitorId,
        }
      );
    }

    return redirectWithVisitorCookie(
      ambassador.whatsapp_link || FALLBACK_WHATSAPP_LINK,
      visitorId
    );
  } catch (error: any) {
    await writeRouteLog(
      supabase,
      cleanCode,
      'route_failed',
      error?.message || 'Unknown route error',
      {
        visitor_id: visitorId,
      }
    );

    return redirectWithVisitorCookie(FALLBACK_WHATSAPP_LINK, visitorId);
  }
}