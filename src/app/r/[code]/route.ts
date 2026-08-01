import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VISITOR_COOKIE_NAME = 'emmytech_visitor_id';
const VISITOR_ID_PATTERN = /^[a-z0-9:_-]{8,200}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function redirectWithVisitorCookie(
  request: NextRequest,
  url: string,
  visitorId: string
) {
  const response = NextResponse.redirect(url);

  response.cookies.set({
    name: VISITOR_COOKIE_NAME,
    value: visitorId,
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
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
  const suppliedVisitorId = request.nextUrl.searchParams.get('visitor_id')?.trim();
  const visitorId =
    (suppliedVisitorId && VISITOR_ID_PATTERN.test(suppliedVisitorId)
      ? suppliedVisitorId.toLowerCase()
      : null) ||
    (existingVisitorId && VISITOR_ID_PATTERN.test(existingVisitorId)
      ? existingVisitorId.toLowerCase()
      : null) ||
    createVisitorId();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return redirectWithVisitorCookie(
      request,
      buildWhatsappLink(null, 'Hello Emmytechnology, I would like to know more.'),
      visitorId
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress =
      forwardedFor?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    const userAgent = request.headers.get('user-agent') || null;

    await writeRouteLog(
      supabase,
      cleanCode,
      'route_started',
      'Referral route started',
      {
        visitor_id: visitorId,
        had_existing_cookie: Boolean(existingVisitorId),
        has_ip_address: Boolean(ipAddress),
        has_user_agent: Boolean(userAgent),
      }
    );

    const { data: ambassadors, error: ambassadorError } = await supabase
      .from('ambassadors')
      .select(
        'id, referral_code, custom_referral_code, ambassador_tag, display_name, status, whatsapp_link'
      )
      .eq('status', 'active');

    if (ambassadorError) {
      await writeRouteLog(
        supabase,
        cleanCode,
        'ambassador_error',
        ambassadorError.message
      );

      return redirectWithVisitorCookie(
        request,
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
        request,
        buildWhatsappLink(null, 'Hello Emmytechnology, I would like to know more.'),
        visitorId
      );
    }

    const ambassadorName =
      ambassador.display_name ||
      ambassador.ambassador_tag?.replace('#', '') ||
      'an EmmyTech ambassador';

    const referralCodeToTrack =
      ambassador.custom_referral_code || ambassador.referral_code || cleanCode;

    const sourcePage = request.nextUrl.searchParams
      .get('source_page')
      ?.slice(0, 500) || null;
    const rawProductId = request.nextUrl.searchParams.get('product_id');
    const productId = rawProductId && UUID_PATTERN.test(rawProductId)
      ? rawProductId
      : null;
    const searchQuery = request.nextUrl.searchParams
      .get('search_query')
      ?.trim()
      .slice(0, 300) || null;

    const { data: trackingResult, error: rpcError } = await supabase.rpc(
      'track_whatsapp_referral_click_v3',
      {
        p_referral_code: referralCodeToTrack,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_visitor_id: visitorId,
        p_source_page: sourcePage,
        p_product_id: productId,
        p_search_query: searchQuery,
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
        'WhatsApp referral click tracked successfully',
        {
          referral_code_to_track: referralCodeToTrack,
          visitor_id: visitorId,
          referral_click_id: trackingResult?.referral_click_id || null,
          existing_lead: trackingResult?.existing_lead || false,
        }
      );
    }

    const clickReference = trackingResult?.referral_click_id
      ? `\n\nReference: WA-${String(trackingResult.referral_click_id)
          .replace(/-/g, '')
          .slice(0, 8)
          .toUpperCase()}`
      : '';
    const finalMessage = `${getRotatingMessage(ambassadorName)}${clickReference}`;
    const finalWhatsappLink = buildWhatsappLink(
      ambassador.whatsapp_link,
      finalMessage
    );

    return redirectWithVisitorCookie(request, finalWhatsappLink, visitorId);
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
      request,
      buildWhatsappLink(null, 'Hello Emmytechnology, I would like to know more.'),
      visitorId
    );
  }
}