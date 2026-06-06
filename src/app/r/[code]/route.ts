import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const EMMYTECH_WHATSAPP_NUMBER = '2348146503700';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const supabase = await createClient();

  const ipAddress =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    null;

  const userAgent = request.headers.get('user-agent');

  await supabase.rpc('track_whatsapp_referral_click', {
    p_referral_code: code,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });

  const message = encodeURIComponent(
    'Hello EmmyTech, I am interested in your services.'
  );

  const whatsappUrl = `https://wa.me/${EMMYTECH_WHATSAPP_NUMBER}?text=${message}`;

  return NextResponse.redirect(whatsappUrl);
}