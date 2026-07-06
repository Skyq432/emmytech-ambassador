import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const VISITOR_COOKIE_NAME = 'emmytech_visitor_id';

const FALLBACK_WHATSAPP_NUMBER = '2348146503700';

const referralMessages = [
  'Hello Emmytechnology, {name} shared this with me, I’d like to know more.',
  'Hello Emmytechnology, I got this contact from {name}.',
  'Hello Emmytechnology, {name} sent me your contact.',
  'Hello Emmytechnology, I was referred by {name}.',
  'Hello Emmytechnology, {name} gave me this number, please I need more info.',
  'Hello Emmytechnology, my friend {name} told me about you.',
  'Hello Emmytechnology, {name} recommended I reach out to you.',
  'Hello Emmytechnology, I was told to contact you by {name}.',
  'Hello Emmytechnology, {name} linked me up with you guys.',
  'Hello Emmytechnology, I’m reaching out because {name} mentioned you.',
];

function createVisitorId() {
  return crypto.randomUUID();
}

function getRotatingMessage(ambassadorName: string) {
  const threeMinutes = 3 * 60 * 1000;
  const index = Math.floor(Date.now() / threeMinutes) % referralMessages.length;

  return referralMessages[index].replace('{name}', ambassadorName);
}

function extractWhatsappNumber(whatsappLink?: string | null) {
  if (!whatsappLink) return FALLBACK_WHATSAPP_NUMBER;

  const match = whatsappLink.match(/wa\.me\/(\d+)/);

  return match?.[1] || FALLBACK_WHATSAPP_NUMBER;
}

function buildWhatsappLink(whatsappLink: string | null, message: string) {
  const number = extractWhatsappNumber(whatsappLink);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
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
    // Never block redirect because of logging.
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
    const fallbackMessage =
      'Hello Emmytechnology, I would like to know more.';
    return redirectWithVisitorCookie(
      buildWhatsappLink(null, fallbackMessage),
      visitorId
    );
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
      .select('id, referral_code, custom_referral_code, status, whatsapp_link, users(name)')
      .eq('status', 'active');

    if (ambassadorError) {
      await writeRouteLog(
        supabase,
        cleanCode,
        'ambassador_error',
        ambassadorError.message
      );

      return redirectWithVisitorCookie(
        buildWhatsappLink(null, 'Hello Emmytechnology, I would like to know more.'),
        visitorId
      );
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
        'No active ambassador found'
      );

      return redirectWithVisitorCookie(
        buildWhatsappLink(null, 'Hello Emmytechnology, I would like to know more.'),
        visitorId
      );
    }

const linkedUser = Array.isArray(ambassador.users)
  ? ambassador.users[0]
  : ambassador.users;

const ambassadorName =
  linkedUser?.name || 'an EmmyTech ambassador';

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
      await writeRouteLog(supabase, cleanCode, 'rpc_error', rpcError.message, {
        referral_code_to_track: referralCodeToTrack,
        visitor_id: visitorId,
      });
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

    const finalMessage = getRotatingMessage(ambassadorName);
    const finalWhatsappLink = buildWhatsappLink(
      ambassador.whatsapp_link,
      finalMessage
    );

    return redirectWithVisitorCookie(finalWhatsappLink, visitorId);
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

    return redirectWithVisitorCookie(
      buildWhatsappLink(null, 'Hello Emmytechnology, I would like to know more.'),
      visitorId
    );
  }
}