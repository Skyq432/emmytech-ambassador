import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const FALLBACK_WHATSAPP_LINK =
  'https://wa.me/2348146503700?text=Hello%20EmmyTech%2C%20I%20want%20to%20make%20an%20enquiry.';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cleanCode = decodeURIComponent(code).trim().toLowerCase();

  const supabase = await createClient();

  const ipAddress =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    null;

  const userAgent = request.headers.get('user-agent');

  const { data: ambassador } = await supabase
    .from('ambassadors')
    .select('id, referral_code, custom_referral_code, status, whatsapp_link')
    .or(
      `referral_code.ilike.${cleanCode},custom_referral_code.ilike.${cleanCode}`
    )
    .eq('status', 'active')
    .maybeSingle();

  if (!ambassador) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  await supabase.rpc('track_whatsapp_referral_click', {
    p_referral_code: ambassador.custom_referral_code || ambassador.referral_code,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });

  const redirectUrl = ambassador.whatsapp_link || FALLBACK_WHATSAPP_LINK;

  return NextResponse.redirect(redirectUrl);
}