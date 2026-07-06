import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const VISITOR_COOKIE_NAME = 'emmytech_visitor_id';

const FALLBACK_MESSAGE =
  'Hello EmmyTech,\n\nI would like to make an enquiry about your services.\n\nKindly let me know the next step.';

const FALLBACK_WHATSAPP_NUMBER = '2348146503700';

function createVisitorId() {
  return crypto.randomUUID();
}

function buildWhatsappLink(phoneOrLink: string | null, message: string) {
  const encodedMessage = encodeURIComponent(message);

  if (!phoneOrLink) {
    return `https://wa.me/${FALLBACK_WHATSAPP_NUMBER}?text=${encodedMessage}`;
  }

  if (phoneOrLink.includes('wa.me')) {
    const baseUrl = phoneOrLink.split('?')[0];
    return `${baseUrl}?text=${encodedMessage}`;
  }

  const cleanPhone = phoneOrLink.replace(/\D/g, '');
  return `https://wa.me/${cleanPhone || FALLBACK_WHATSAPP_NUMBER}?text=${encodedMessage}`;
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
    const fallbackUrl = buildWhatsappLink(null, FALLBACK_MESSAGE);
    return redirectWithVisitorCookie(fallbackUrl, visitorId);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const ipAddress =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      null;

    const userAgent = request.headers.get('user-agent') || null;

    await writeRouteLog(supabase, cleanCode, 'route_started', 'Referral route started', {
      visitor_id: visitorId,
      had_existing_cookie: Boolean(existingVisitorId),
      ipAddress,
      userAgent,
    });

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

      const fallbackUrl = buildWhatsappLink(null, FALLBACK_MESSAGE);
      return redirectWithVisitorCookie(fallbackUrl, visitorId);
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

      const fallbackUrl = buildWhatsappLink(null, FALLBACK_MESSAGE);
      return redirectWithVisitorCookie(fallbackUrl, visitorId);
    }

    const referralCodeToTrack =
      ambassador.custom_referral_code || ambassador.referral_code || cleanCode;

    const { data: rpcData, error: rpcError } = await supabase.rpc(
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

      const fallbackUrl = buildWhatsappLink(
        ambassador.whatsapp_link,
        FALLBACK_MESSAGE
      );

      return redirectWithVisitorCookie(fallbackUrl, visitorId);
    }

    const conversationMessage =
      rpcData?.conversation_message || FALLBACK_MESSAGE;

    await writeRouteLog(
      supabase,
      cleanCode,
      'rpc_success',
      'Referral click tracked successfully',
      {
        referral_code_to_track: referralCodeToTrack,
        visitor_id: visitorId,
        lead_code: rpcData?.lead_code,
        is_new_lead: rpcData?.is_new_lead,
        conversation_fingerprint: rpcData?.conversation_fingerprint,
      }
    );

    const whatsappUrl = buildWhatsappLink(
      ambassador.whatsapp_link,
      conversationMessage
    );

    return redirectWithVisitorCookie(whatsappUrl, visitorId);
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

    const fallbackUrl = buildWhatsappLink(null, FALLBACK_MESSAGE);
    return redirectWithVisitorCookie(fallbackUrl, visitorId);
  }
}