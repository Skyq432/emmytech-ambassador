-- EmmyTech local development seed data.
-- Synthetic records only. Safe to commit and recreate with `supabase db reset --local`.

begin;

set local statement_timeout = '60s';

-- Local login accounts. All three use the password: EmmyTest2026!
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@emmytech.test',
    extensions.crypt('EmmyTest2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"app_role":"admin"}'::jsonb,
    '{"name":"EmmyTech Test Admin"}'::jsonb,
    now() - interval '30 days',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'ada.ambassador@emmytech.test',
    extensions.crypt('EmmyTest2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"app_role":"ambassador"}'::jsonb,
    '{"name":"Ada Okafor"}'::jsonb,
    now() - interval '21 days',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'chidi.ambassador@emmytech.test',
    extensions.crypt('EmmyTest2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"app_role":"ambassador"}'::jsonb,
    '{"name":"Chidi Eze"}'::jsonb,
    now() - interval '14 days',
    now()
  )
on conflict (id) do nothing;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"admin@emmytech.test","email_verified":true}'::jsonb,
    'email', now(), now() - interval '30 days', now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '{"sub":"00000000-0000-4000-8000-000000000002","email":"ada.ambassador@emmytech.test","email_verified":true}'::jsonb,
    'email', now(), now() - interval '21 days', now()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003',
    '{"sub":"00000000-0000-4000-8000-000000000003","email":"chidi.ambassador@emmytech.test","email_verified":true}'::jsonb,
    'email', now(), now() - interval '14 days', now()
  )
on conflict do nothing;

insert into public.users (id, name, email, role, invite_code, created_at)
values
  ('00000000-0000-4000-8000-000000000001', 'EmmyTech Test Admin', 'admin@emmytech.test', 'admin', null, now() - interval '30 days'),
  ('00000000-0000-4000-8000-000000000002', 'Ada Okafor', 'ada.ambassador@emmytech.test', 'ambassador', null, now() - interval '21 days'),
  ('00000000-0000-4000-8000-000000000003', 'Chidi Eze', 'chidi.ambassador@emmytech.test', 'ambassador', null, now() - interval '14 days')
on conflict (id) do nothing;

insert into public.ambassadors (
  id, user_id, ambassador_tag, referral_code, whatsapp_number, whatsapp_link,
  bio, social_links, total_points, total_leads, total_conversions, status,
  available_balance, total_cashed_out, display_name, created_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '@ada_emmytech', 'ADA25', '+2348000000101',
    'https://wa.me/2348000000101',
    'Test ambassador focused on phones and solar products.',
    '{"instagram":"@ada_emmytech","tiktok":"@ada_emmytech"}'::jsonb,
    850, 3, 1, 'active', 7500, 5000, 'Ada O.', now() - interval '21 days'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '@chidi_emmytech', 'CHIDI25', '+2348000000102',
    'https://wa.me/2348000000102',
    'Test ambassador focused on laptops and accessories.',
    '{"instagram":"@chidi_emmytech","twitter":"@chidi_emmytech"}'::jsonb,
    420, 2, 0, 'active', 3200, 0, 'Chidi E.', now() - interval '14 days'
  )
on conflict (id) do nothing;

insert into public.app_settings (key, value, updated_by, updated_at)
values
  ('brand_config', '{"brand_name":"EmmyTech","environment":"local-test","currency":"NGN"}'::jsonb, '00000000-0000-4000-8000-000000000001', now()),
  ('support_whatsapp', '"2348000000000"'::jsonb, '00000000-0000-4000-8000-000000000001', now())
on conflict (key) do update
set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

-- Unified customer identities used across Spin, Ambassador, website and CRM.
insert into public.identities (
  id, identity_code, primary_name, primary_phone, primary_email,
  status, confidence_score, created_at, updated_at
)
values
  ('20000000-0000-4000-8000-000000000001', 'IDN-TEST0001', 'Amina Yusuf', '+2348000000001', 'amina.yusuf@example.test', 'active', 95, now() - interval '12 days', now()),
  ('20000000-0000-4000-8000-000000000002', 'IDN-TEST0002', 'Tunde Balogun', '+2348000000002', 'tunde.balogun@example.test', 'active', 90, now() - interval '10 days', now()),
  ('20000000-0000-4000-8000-000000000003', 'IDN-TEST0003', 'Ifeoma Okeke', '+2348000000003', 'ifeoma.okeke@example.test', 'active', 88, now() - interval '8 days', now()),
  ('20000000-0000-4000-8000-000000000004', 'IDN-TEST0004', 'Chinedu Nwosu', '+2348000000004', 'chinedu.nwosu@example.test', 'active', 82, now() - interval '6 days', now()),
  ('20000000-0000-4000-8000-000000000005', 'IDN-TEST0005', 'Zainab Bello', '+2348000000005', 'zainab.bello@example.test', 'active', 78, now() - interval '4 days', now()),
  ('20000000-0000-4000-8000-000000000006', 'IDN-TEST0006', 'Amina Y.', '+2348000000099', 'amina.duplicate@example.test', 'review', 55, now() - interval '2 days', now())
on conflict (id) do nothing;

insert into public.identity_signal_weights (
  signal_type, weight, auto_merge, needs_review_threshold,
  strong_match_threshold, description, updated_at
)
values
  ('email', 100, true, 70, 90, 'Exact normalized email match.', now()),
  ('phone', 100, true, 70, 90, 'Exact normalized phone match.', now()),
  ('visitor_id', 60, false, 70, 90, 'Browser visitor identifier.', now()),
  ('device', 45, false, 70, 90, 'Device fingerprint.', now()),
  ('name', 35, false, 70, 90, 'Normalized customer name.', now())
on conflict (signal_type) do update
set weight = excluded.weight, auto_merge = excluded.auto_merge, updated_at = excluded.updated_at;

insert into public.identity_signals (
  id, identity_id, signal_type, signal_value, confidence_weight,
  verified, source, first_seen_at, last_seen_at, seen_count
)
values
  ('4b000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'email', 'amina.yusuf@example.test', 100, true, 'spin', now() - interval '12 days', now(), 4),
  ('4b000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'phone', '+2348000000001', 100, true, 'crm', now() - interval '12 days', now(), 6),
  ('4b000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'visitor_id', 'visitor-test-002', 60, true, 'website', now() - interval '10 days', now(), 3),
  ('4b000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000006', 'name', 'amina yusuf', 35, false, 'lead', now() - interval '2 days', now(), 1)
on conflict (id) do nothing;

insert into public.identity_events (
  id, identity_id, event_type, title, description, metadata, created_at
)
values
  ('4c000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'identity_created', 'Identity created', 'Created through the local spin registration flow.', '{"source":"spin"}'::jsonb, now() - interval '12 days'),
  ('4c000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'website_product_view', 'Product viewed', 'Viewed the EmmyTech solar power kit.', '{"visitor_id":"visitor-test-002"}'::jsonb, now() - interval '3 days'),
  ('4c000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'crm_followup_created', 'Follow-up scheduled', 'Sales follow-up created by the test admin.', '{"priority":"high"}'::jsonb, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.identity_match_suggestions (
  id, identity_a, identity_b, confidence, reasons, decision, created_at
)
values (
  '4d000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000006',
  72,
  '["similar normalized name","same acquisition campaign"]'::jsonb,
  'pending',
  now() - interval '1 day'
)
on conflict (id) do nothing;

insert into public.identity_ambassador_conflicts (
  id, identity_id, original_ambassador_id, new_ambassador_id,
  reason, confidence, decision, created_at
)
values (
  '4e000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'Customer used two Ambassador links on different visits.',
  82, 'pending', now() - interval '6 hours'
)
on conflict (id) do nothing;

-- Product catalogue and website journeys.
insert into public.product_categories (id, name, slug, created_at)
values
  ('30000000-0000-4000-8000-000000000001', 'Phones', 'phones', now() - interval '20 days'),
  ('30000000-0000-4000-8000-000000000002', 'Laptops', 'laptops', now() - interval '20 days'),
  ('30000000-0000-4000-8000-000000000003', 'Solar & Power', 'solar-power', now() - interval '20 days')
on conflict (id) do nothing;

insert into public.products (
  id, name, slug, description, price, original_price, sale_price,
  discount_percentage, category, category_id, stock, status,
  featured, product_tag, created_at, updated_at
)
values
  ('31000000-0000-4000-8000-000000000001', 'EmmyPhone X1', 'test-emmyphone-x1', 'Synthetic smartphone used for local testing.', 185000, 200000, 185000, 8, 'Phones', '30000000-0000-4000-8000-000000000001', 14, 'active', true, 'Bestseller', now() - interval '18 days', now()),
  ('31000000-0000-4000-8000-000000000002', 'EmmyBook Air 14', 'test-emmybook-air-14', 'Synthetic lightweight laptop used for local testing.', 620000, 650000, 620000, 5, 'Laptops', '30000000-0000-4000-8000-000000000002', 6, 'active', true, 'New', now() - interval '17 days', now()),
  ('31000000-0000-4000-8000-000000000003', 'Solar Power Kit 1.5KVA', 'test-solar-power-kit-15kva', 'Synthetic inverter, battery and panels bundle.', 980000, 1050000, 980000, 7, 'Solar & Power', '30000000-0000-4000-8000-000000000003', 4, 'active', true, 'Popular', now() - interval '16 days', now())
on conflict (id) do nothing;

insert into public.product_images (
  id, product_id, image_url, image_path, is_primary, sort_order, created_at
)
values
  ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '/test-assets/emmyphone-x1.png', 'test-assets/emmyphone-x1.png', true, 1, now()),
  ('32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', '/test-assets/emmybook-air.png', 'test-assets/emmybook-air.png', true, 1, now()),
  ('32000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000003', '/test-assets/solar-kit.png', 'test-assets/solar-kit.png', true, 1, now())
on conflict (id) do nothing;

insert into public.visitor_sessions (
  id, visitor_id, ambassador_id, referral_code, ip_address, user_agent,
  first_seen, last_seen, created_at
)
values
  ('33000000-0000-4000-8000-000000000001', 'visitor-test-001', '10000000-0000-4000-8000-000000000001', 'ADA25', '127.0.0.1', 'EmmyTech Local Chrome', now() - interval '4 days', now() - interval '2 hours', now() - interval '4 days'),
  ('33000000-0000-4000-8000-000000000002', 'visitor-test-002', '10000000-0000-4000-8000-000000000002', 'CHIDI25', '127.0.0.1', 'EmmyTech Local Mobile', now() - interval '3 days', now() - interval '1 hour', now() - interval '3 days'),
  ('33000000-0000-4000-8000-000000000003', 'visitor-test-direct', null, null, '127.0.0.1', 'EmmyTech Local Safari', now() - interval '1 day', now(), now() - interval '1 day')
on conflict (id) do nothing;

insert into public.product_views (id, visitor_id, product_id, ambassador_id, viewed_at)
values
  ('34000000-0000-4000-8000-000000000001', 'visitor-test-001', '31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  ('34000000-0000-4000-8000-000000000002', 'visitor-test-002', '31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', now() - interval '1 hour')
on conflict (id) do nothing;

insert into public.cart_events (id, visitor_id, product_id, ambassador_id, quantity, created_at)
values
  ('35000000-0000-4000-8000-000000000001', 'visitor-test-001', '31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, now() - interval '90 minutes'),
  ('35000000-0000-4000-8000-000000000002', 'visitor-test-002', '31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 1, now() - interval '45 minutes')
on conflict (id) do nothing;

insert into public.website_events (
  id, visitor_id, product_id, ambassador_id, event_type, quantity, source_page, created_at
)
values
  ('80000000-0000-4000-8000-000000000001', 'visitor-test-001', null, '10000000-0000-4000-8000-000000000001', 'website_visited', 1, '/', now() - interval '2 hours'),
  ('80000000-0000-4000-8000-000000000002', 'visitor-test-001', '31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'product_viewed', 1, '/products/test-emmyphone-x1', now() - interval '110 minutes'),
  ('80000000-0000-4000-8000-000000000003', 'visitor-test-001', '31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'add_to_cart', 1, '/products/test-emmyphone-x1', now() - interval '90 minutes'),
  ('80000000-0000-4000-8000-000000000004', 'visitor-test-002', '31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'spin_opened_from_product', 1, '/products/test-solar-power-kit-15kva', now() - interval '40 minutes')
on conflict (id) do nothing;

-- Ambassador leads, activity, points, conversions and payouts.
insert into public.leads (
  id, lead_code, ambassador_id, source, source_detail, customer_name, customer_phone,
  customer_email, referral_code_used, status, notes, assigned_admin,
  visitor_id, product_id, lead_type, source_page, identity_id,
  funnel_stage, lead_approval_status, approved_as_lead, approved_at,
  approved_by, created_at, updated_at
)
values
  ('40000000-0000-4000-8000-000000000001', 'EML-TEST0001', '10000000-0000-4000-8000-000000000001', 'referral', '{"campaign":"local-ambassador-test"}'::jsonb, 'Amina Yusuf', '+2348000000001', 'amina.yusuf@example.test', 'ADA25', 'converted', 'Purchased the test phone.', '00000000-0000-4000-8000-000000000001', 'visitor-test-001', '31000000-0000-4000-8000-000000000001', 'product_interest', '/products/test-emmyphone-x1', '20000000-0000-4000-8000-000000000001', 'won', 'approved', true, now() - interval '2 days', '00000000-0000-4000-8000-000000000001', now() - interval '8 days', now() - interval '2 days'),
  ('40000000-0000-4000-8000-000000000002', 'EML-TEST0002', '10000000-0000-4000-8000-000000000002', 'website_cart', '{"cart_total":980000}'::jsonb, 'Tunde Balogun', '+2348000000002', 'tunde.balogun@example.test', 'CHIDI25', 'contacted', 'Requested installation details.', '00000000-0000-4000-8000-000000000001', 'visitor-test-002', '31000000-0000-4000-8000-000000000003', 'cart', '/cart', '20000000-0000-4000-8000-000000000002', 'qualified', 'approved', true, now() - interval '1 day', '00000000-0000-4000-8000-000000000001', now() - interval '5 days', now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000003', 'EML-TEST0003', '10000000-0000-4000-8000-000000000001', 'whatsapp', '{}'::jsonb, 'Ifeoma Okeke', '+2348000000003', 'ifeoma.okeke@example.test', 'ADA25', 'new', 'Asked about laptop warranty.', '00000000-0000-4000-8000-000000000001', null, '31000000-0000-4000-8000-000000000002', 'whatsapp_enquiry', '/contact', '20000000-0000-4000-8000-000000000003', 'new_lead', 'pending', false, null, null, now() - interval '1 day', now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000004', 'EML-TEST0004', null, 'direct', '{}'::jsonb, 'Chinedu Nwosu', '+2348000000004', 'chinedu.nwosu@example.test', null, 'lost', 'Budget postponed.', '00000000-0000-4000-8000-000000000001', 'visitor-test-direct', '31000000-0000-4000-8000-000000000002', 'direct_enquiry', '/contact', '20000000-0000-4000-8000-000000000004', 'lost', 'approved', true, now() - interval '3 days', '00000000-0000-4000-8000-000000000001', now() - interval '6 days', now() - interval '3 days'),
  ('40000000-0000-4000-8000-000000000005', 'EML-TEST0005', '10000000-0000-4000-8000-000000000002', 'social', '{"platform":"instagram"}'::jsonb, 'Zainab Bello', '+2348000000005', 'zainab.bello@example.test', 'CHIDI25', 'contacted', 'Interested in a phone for business.', '00000000-0000-4000-8000-000000000001', null, '31000000-0000-4000-8000-000000000001', 'social_enquiry', '/products/test-emmyphone-x1', '20000000-0000-4000-8000-000000000005', 'proposal', 'approved', true, now() - interval '8 hours', '00000000-0000-4000-8000-000000000001', now() - interval '2 days', now() - interval '8 hours')
on conflict (id) do nothing;

insert into public.conversions (
  id, lead_id, ambassador_id, amount, commission_amount, commission_rate,
  approved_by, approved_at, points_generated, commission_percentage,
  conversion_sequence, is_repeat_conversion, is_commissionable, internal_note
)
values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  185000, 9250, 0.05,
  '00000000-0000-4000-8000-000000000001',
  now() - interval '2 days', 250, 5, 1, false, true,
  'Synthetic conversion for local testing.'
)
on conflict (id) do nothing;

insert into public.activities (
  id, ambassador_id, platform, post_url, caption, submitted_at,
  status, reviewed_by, reviewed_at, points_awarded, rejection_reason
)
values
  ('42000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'instagram', 'https://example.test/posts/ada-phone', 'EmmyPhone local test campaign', now() - interval '4 days', 'approved', '00000000-0000-4000-8000-000000000001', now() - interval '3 days', 100, null),
  ('42000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'tiktok', 'https://example.test/posts/chidi-solar', 'Solar kit local test campaign', now() - interval '1 day', 'pending_review', null, null, 0, null),
  ('42000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'threads', 'https://example.test/posts/ada-laptop', 'Laptop local test campaign', now() - interval '5 days', 'rejected', '00000000-0000-4000-8000-000000000001', now() - interval '4 days', 0, 'Post did not include the campaign tag.')
on conflict (id) do nothing;

insert into public.point_transactions (
  id, ambassador_id, amount, type, reference_id, reference_type, reason, created_at
)
values
  ('43000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 100, 'post', '42000000-0000-4000-8000-000000000001', 'activity', 'Approved Instagram activity.', now() - interval '3 days'),
  ('43000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 250, 'conversion', '41000000-0000-4000-8000-000000000001', 'conversion', 'Converted phone sale.', now() - interval '2 days'),
  ('43000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 50, 'lead', '40000000-0000-4000-8000-000000000002', 'lead', 'Qualified solar lead.', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.payouts (
  id, ambassador_id, amount, points_paid, status, paid_at, paid_by, notes, created_at
)
values
  ('44000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 5000, 500, 'paid', now() - interval '3 days', '00000000-0000-4000-8000-000000000001', 'Synthetic completed payout.', now() - interval '4 days'),
  ('44000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 2500, 250, 'pending', null, null, 'Synthetic pending payout.', now() - interval '6 hours')
on conflict (id) do nothing;

insert into public.invite_links (
  id, code, created_by, max_uses, used_count, expires_at, role, status, created_at
)
values
  ('45000000-0000-4000-8000-000000000001', 'LOCAL-AMBASSADOR-01', '00000000-0000-4000-8000-000000000001', 5, 2, now() + interval '30 days', 'ambassador', 'active', now() - interval '2 days'),
  ('45000000-0000-4000-8000-000000000002', 'LOCAL-EXPIRED-01', '00000000-0000-4000-8000-000000000001', 1, 1, now() - interval '1 day', 'ambassador', 'expired', now() - interval '10 days')
on conflict (id) do nothing;

insert into public.referral_clicks (
  id, ambassador_id, referral_code, source, ip_address, user_agent,
  visitor_fingerprint, counted_as_lead, visitor_id, lead_id,
  match_score, match_reason, identity_id, created_at
)
values
  ('46000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ADA25', 'whatsapp', '127.0.0.1', 'EmmyTech Local Chrome', 'fingerprint-test-001', true, 'visitor-test-001', '40000000-0000-4000-8000-000000000001', 95, 'Referral code and visitor matched.', '20000000-0000-4000-8000-000000000001', now() - interval '8 days'),
  ('46000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'CHIDI25', 'instagram', '127.0.0.1', 'EmmyTech Local Mobile', 'fingerprint-test-002', true, 'visitor-test-002', '40000000-0000-4000-8000-000000000002', 88, 'Referral code and cart matched.', '20000000-0000-4000-8000-000000000002', now() - interval '5 days')
on conflict (id) do nothing;

insert into public.lead_signals (
  id, lead_id, ambassador_id, signal_type, signal_value, confidence_weight,
  first_seen_at, last_seen_at, seen_count, verified, created_at
)
values
  ('47000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'phone', '+2348000000001', 100, now() - interval '8 days', now(), 3, true, now() - interval '8 days'),
  ('47000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'visitor_id', 'visitor-test-002', 60, now() - interval '5 days', now(), 2, true, now() - interval '5 days')
on conflict (id) do nothing;

insert into public.lead_events (
  id, lead_id, ambassador_id, event_type, event_title,
  event_description, event_data, created_by, created_at
)
values
  ('48000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'lead_created', 'Lead created', 'Customer entered through Ada referral.', '{"source":"referral"}'::jsonb, '00000000-0000-4000-8000-000000000001', now() - interval '8 days'),
  ('48000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'converted', 'Lead converted', 'Phone purchase completed.', '{"amount":185000}'::jsonb, '00000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('48000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'contacted', 'WhatsApp follow-up sent', 'Solar installation questions answered.', '{}'::jsonb, '00000000-0000-4000-8000-000000000001', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.ambassador_bonuses (id, ambassador_id, amount, reason, added_by, created_at)
values
  ('49000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1000, 'Monthly local-test performance bonus.', '00000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('49000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 500, 'Quality lead bonus.', '00000000-0000-4000-8000-000000000001', now() - interval '8 hours')
on conflict (id) do nothing;

insert into public.admin_notifications (
  id, type, title, message, related_table, related_id,
  ambassador_id, lead_id, is_read, created_at
)
values
  ('4a000000-0000-4000-8000-000000000001', 'activity_review', 'Activity awaiting review', 'Chidi submitted a TikTok activity.', 'activities', '42000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', null, false, now() - interval '1 day'),
  ('4a000000-0000-4000-8000-000000000002', 'new_lead', 'New WhatsApp lead', 'Ifeoma asked about laptop warranty.', 'leads', '40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', false, now() - interval '1 hour')
on conflict (id) do nothing;

insert into public.referral_route_logs (id, code, step, message, data, created_at)
values
  ('4f000000-0000-4000-8000-000000000001', 'ADA25', 'resolved', 'Referral code resolved to Ada.', '{"visitor_id":"visitor-test-001"}'::jsonb, now() - interval '8 days'),
  ('4f000000-0000-4000-8000-000000000002', 'CHIDI25', 'redirected', 'Visitor redirected to the product page.', '{"visitor_id":"visitor-test-002"}'::jsonb, now() - interval '5 days')
on conflict (id) do nothing;

-- CRM pipeline, quotes, sales, invoices, receipts, communications and follow-ups.
insert into public.crm_funnel_stages (id, stage_key, stage_name, stage_order, is_active, created_at)
values
  ('60000000-0000-4000-8000-000000000001', 'new_lead', 'New Lead', 1, true, now()),
  ('60000000-0000-4000-8000-000000000002', 'contacted', 'Contacted', 2, true, now()),
  ('60000000-0000-4000-8000-000000000003', 'qualified', 'Qualified', 3, true, now()),
  ('60000000-0000-4000-8000-000000000004', 'proposal', 'Proposal Sent', 4, true, now()),
  ('60000000-0000-4000-8000-000000000005', 'won', 'Won', 5, true, now()),
  ('60000000-0000-4000-8000-000000000006', 'lost', 'Lost', 6, true, now())
on conflict (id) do nothing;

insert into public.crm_products (
  id, product_name, product_category, description, default_price,
  is_active, created_at, updated_at
)
values
  ('61000000-0000-4000-8000-000000000001', 'EmmyPhone X1', 'Phones', 'CRM test product.', 185000, true, now(), now()),
  ('61000000-0000-4000-8000-000000000002', 'EmmyBook Air 14', 'Laptops', 'CRM test product.', 620000, true, now(), now()),
  ('61000000-0000-4000-8000-000000000003', 'Solar Power Kit 1.5KVA', 'Solar & Power', 'CRM test product.', 980000, true, now(), now())
on conflict (id) do nothing;

insert into public.product_interests (
  id, identity_id, lead_id, product_id, interest_type, source, note, created_at
)
values
  ('62000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'purchase', 'ambassador_referral', 'Converted interest.', now() - interval '8 days'),
  ('62000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000003', 'quote', 'website_cart', 'Needs installation quote.', now() - interval '5 days'),
  ('62000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000002', 'like', 'whatsapp', 'Asked about warranty.', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.crm_funnel_events (
  id, lead_id, identity_id, old_stage, new_stage, changed_by, note, created_at
)
values
  ('63000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'qualified', 'won', '00000000-0000-4000-8000-000000000001', 'Payment completed.', now() - interval '2 days'),
  ('63000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'contacted', 'qualified', '00000000-0000-4000-8000-000000000001', 'Budget and installation location confirmed.', now() - interval '1 day'),
  ('63000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'qualified', 'proposal', '00000000-0000-4000-8000-000000000001', 'Quote prepared.', now() - interval '8 hours')
on conflict (id) do nothing;

insert into public.crm_sales (
  id, identity_id, lead_id, conversion_id, sale_code, customer_name,
  customer_phone, customer_email, total_amount, amount_paid,
  status, created_by, created_at, updated_at
)
values
  ('64000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'SALE-TEST-0001', 'Amina Yusuf', '+2348000000001', 'amina.yusuf@example.test', 185000, 185000, 'paid', '00000000-0000-4000-8000-000000000001', now() - interval '2 days', now()),
  ('64000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', null, 'SALE-TEST-0002', 'Tunde Balogun', '+2348000000002', 'tunde.balogun@example.test', 980000, 300000, 'part_paid', '00000000-0000-4000-8000-000000000001', now() - interval '1 day', now())
on conflict (id) do nothing;

insert into public.crm_sale_items (
  id, sale_id, product_id, item_name, quantity, unit_price, created_at
)
values
  ('65000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'EmmyPhone X1', 1, 185000, now() - interval '2 days'),
  ('65000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000003', 'Solar Power Kit 1.5KVA', 1, 980000, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.crm_invoices (
  id, sale_id, invoice_number, status, issued_at, due_at,
  sent_to_email, sent_at, created_at
)
values
  ('66000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'INV-TEST-0001', 'paid', now() - interval '2 days', now() + interval '5 days', 'amina.yusuf@example.test', now() - interval '2 days', now() - interval '2 days'),
  ('66000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002', 'INV-TEST-0002', 'part_paid', now() - interval '1 day', now() + interval '7 days', 'tunde.balogun@example.test', now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.crm_receipts (
  id, sale_id, receipt_number, amount, payment_method,
  payment_reference, sent_to_email, sent_at, created_at
)
values
  ('67000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'RCT-TEST-0001', 185000, 'bank_transfer', 'TEST-PAY-0001', 'amina.yusuf@example.test', now() - interval '2 days', now() - interval '2 days'),
  ('67000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002', 'RCT-TEST-0002', 300000, 'card', 'TEST-PAY-0002', 'tunde.balogun@example.test', now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.crm_quotes (
  id, identity_id, lead_id, quote_number, customer_name, customer_phone,
  customer_email, subtotal, discount_amount, total_amount, status,
  valid_until, notes, created_by, created_at, updated_at
)
values
  ('68000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'QTE-TEST-0001', 'Tunde Balogun', '+2348000000002', 'tunde.balogun@example.test', 1000000, 20000, 980000, 'accepted', current_date + 7, 'Includes local installation assessment.', '00000000-0000-4000-8000-000000000001', now() - interval '2 days', now()),
  ('68000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'QTE-TEST-0002', 'Zainab Bello', '+2348000000005', 'zainab.bello@example.test', 185000, 5000, 180000, 'sent', current_date + 14, 'Business phone proposal.', '00000000-0000-4000-8000-000000000001', now() - interval '8 hours', now())
on conflict (id) do nothing;

insert into public.crm_quote_items (
  id, quote_id, product_id, item_name, description, quantity,
  unit_price, created_at
)
values
  ('69000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', 'Solar Power Kit 1.5KVA', 'Test solar bundle and assessment.', 1, 980000, now() - interval '2 days'),
  ('69000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001', 'EmmyPhone X1', 'Test business phone.', 1, 180000, now() - interval '8 hours')
on conflict (id) do nothing;

insert into public.crm_followups (
  id, identity_id, lead_id, assigned_to, title, description,
  due_at, status, priority, created_by, completed_at, created_at, updated_at
)
values
  ('6a000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Confirm installation date', 'Call Tunde and confirm the solar installation date.', now() + interval '1 day', 'pending', 'high', '00000000-0000-4000-8000-000000000001', null, now() - interval '1 day', now()),
  ('6a000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Send warranty details', 'Send the laptop warranty document.', now() - interval '2 hours', 'overdue', 'normal', '00000000-0000-4000-8000-000000000001', null, now() - interval '1 day', now()),
  ('6a000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Confirm delivery', 'Confirm Amina received the phone.', now() - interval '1 day', 'completed', 'normal', '00000000-0000-4000-8000-000000000001', now() - interval '20 hours', now() - interval '2 days', now())
on conflict (id) do nothing;

insert into public.crm_communications (
  id, identity_id, lead_id, channel, direction, subject,
  message, status, handled_by, created_at
)
values
  ('6b000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'whatsapp', 'outbound', 'Solar quote follow-up', 'Hello Tunde, your solar quote is ready for review.', 'delivered', '00000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('6b000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'phone', 'inbound', 'Warranty enquiry', 'Customer asked about warranty duration.', 'logged', '00000000-0000-4000-8000-000000000001', now() - interval '20 hours'),
  ('6b000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'email', 'outbound', 'Business phone proposal', 'Proposal sent to the customer.', 'sent', '00000000-0000-4000-8000-000000000001', now() - interval '8 hours')
on conflict (id) do nothing;

insert into public.crm_notifications (
  id, notification_type, title, message, related_entity_type,
  related_entity_id, identity_id, lead_id, priority, status,
  created_for, created_by, created_at
)
values
  ('6c000000-0000-4000-8000-000000000001', 'followup_due', 'Solar follow-up due tomorrow', 'Confirm Tunde''s installation date.', 'followup', '6a000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'high', 'unread', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '1 hour'),
  ('6c000000-0000-4000-8000-000000000002', 'quote_viewed', 'Quote viewed', 'Zainab viewed the phone proposal.', 'quote', '68000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'normal', 'unread', '00000000-0000-4000-8000-000000000001', null, now() - interval '30 minutes')
on conflict (id) do nothing;

insert into public.crm_audit_logs (
  id, actor_id, action, entity_type, entity_id,
  old_data, new_data, note, created_at
)
values
  ('6d000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'create', 'sale', '64000000-0000-4000-8000-000000000001', '{}'::jsonb, '{"status":"paid","total_amount":185000}'::jsonb, 'Synthetic sale created.', now() - interval '2 days'),
  ('6d000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'update', 'lead', '40000000-0000-4000-8000-000000000002', '{"funnel_stage":"contacted"}'::jsonb, '{"funnel_stage":"qualified"}'::jsonb, 'Lead qualified.', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.crm_files (
  id, identity_id, lead_id, sale_id, quote_id, invoice_id, receipt_id,
  file_name, file_url, file_type, file_size, category, note,
  uploaded_by, created_at
)
values
  ('6e000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', null, '66000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001', 'test-invoice-amina.pdf', '/test-documents/test-invoice-amina.pdf', 'application/pdf', 24576, 'invoice', 'Synthetic file record; no customer document.', '00000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('6e000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', null, '68000000-0000-4000-8000-000000000001', null, null, 'test-solar-quote.pdf', '/test-documents/test-solar-quote.pdf', 'application/pdf', 18432, 'quote', 'Synthetic quote file record.', '00000000-0000-4000-8000-000000000001', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.conversation_message_bank (
  id, part_type, part_key, phrase, is_active, created_at
)
values
  ('6f000000-0000-4000-8000-000000000001', 'greeting', 'friendly_hello', 'Hello! Thank you for contacting EmmyTech.', true, now()),
  ('6f000000-0000-4000-8000-000000000002', 'opening', 'product_interest', 'I can help you choose the best option for your needs.', true, now()),
  ('6f000000-0000-4000-8000-000000000003', 'opening', 'budget_question', 'What budget range are you working with?', true, now()),
  ('6f000000-0000-4000-8000-000000000004', 'closing', 'followup', 'I will follow up with the details shortly.', true, now()),
  ('6f000000-0000-4000-8000-000000000005', 'closing', 'thanks', 'Thank you for choosing EmmyTech.', true, now())
on conflict (id) do nothing;

-- Spin-wheel rules, players, prizes, rewards, referrals and Cash-Off balances.
insert into public.spin_game_settings (setting_key, setting_value, updated_at)
values
  ('default_spins', '1'::jsonb, now()),
  ('referral_bonus_spins', '1'::jsonb, now()),
  ('cash_challenge_hours', '24'::jsonb, now()),
  ('cash_challenge_target', '1000'::jsonb, now()),
  ('cash_challenge_cap', '3000'::jsonb, now()),
  ('cash_off_conversion_floor', '700'::jsonb, now()),
  ('wheel_enabled', 'true'::jsonb, now())
on conflict (setting_key) do update
set setting_value = excluded.setting_value, updated_at = excluded.updated_at;

insert into public.spin_letter_segments (segment_code, segment_order, is_active, created_at)
values
  ('EM', 1, true, now()),
  ('MY', 2, true, now()),
  ('TE', 3, true, now()),
  ('CH', 4, true, now()),
  ('NO', 5, true, now()),
  ('LO', 6, true, now()),
  ('GY', 7, true, now())
on conflict (segment_code) do update
set segment_order = excluded.segment_order, is_active = excluded.is_active;

insert into public.spin_prizes (
  id, old_prize_id, label, prize_type, gravity, stock,
  monetary_value, is_active, on_wheel, near_miss, created_at
)
values
  ('51000000-0000-4000-8000-000000000001', 9001, 'TRY AGAIN', 'retry', 18, 9999, 0, true, true, true, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000002', 9002, 'BONUS SPIN', 'bonus', 12, 9999, 0, true, true, false, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000003', 9003, 'EM', 'letter', 10, 9999, 0, true, true, false, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000004', 9004, 'MY', 'letter', 10, 9999, 0, true, true, false, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000005', 9005, '₦100', 'cash', 20, 9999, 100, true, true, false, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000006', 9006, '₦200', 'cash', 12, 9999, 200, true, true, false, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000007', 9007, '₦500', 'cash', 6, 9999, 500, true, true, false, now() - interval '10 days'),
  ('51000000-0000-4000-8000-000000000008', 9008, '₦1,000', 'cash', 2, 9999, 1000, true, true, false, now() - interval '10 days')
on conflict (id) do nothing;

insert into public.spin_rule_groups (
  id, group_key, group_name, group_type, start_spin, end_spin,
  priority, is_active, description, created_at, updated_at
)
values
  ('52000000-0000-4000-8000-000000000001', 'first_spin', 'First Spin', 'fixed', 1, 1, 10, true, 'Guaranteed introductory cash result.', now(), now()),
  ('52000000-0000-4000-8000-000000000002', 'early_spins', 'Early Spins', 'weighted', 2, 5, 20, true, 'Balanced cash, letter, bonus and retry results.', now(), now()),
  ('52000000-0000-4000-8000-000000000003', 'ongoing_spins', 'Ongoing Spins', 'weighted', 6, null, 30, true, 'Ongoing weighted results.', now(), now())
on conflict (id) do nothing;

insert into public.spin_rule_items (
  id, group_id, item_key, result_label, result_type, cash_amount,
  letter_code, bonus_spins, gravity, item_order, max_uses_per_user,
  is_active, created_at, updated_at
)
values
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'first_cash_100', '₦100', 'cash', 100, null, 0, 1, 1, 1, true, now(), now()),
  ('53000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'early_retry', 'TRY AGAIN', 'retry', 0, null, 0, 18, 1, 999, true, now(), now()),
  ('53000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000002', 'early_bonus', 'BONUS SPIN', 'bonus', 0, null, 1, 12, 2, 3, true, now(), now()),
  ('53000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000002', 'early_letter', 'LETTER', 'letter', 0, null, 0, 16, 3, 7, true, now(), now()),
  ('53000000-0000-4000-8000-000000000005', '52000000-0000-4000-8000-000000000002', 'early_cash_200', '₦200', 'cash', 200, null, 0, 14, 4, 2, true, now(), now()),
  ('53000000-0000-4000-8000-000000000006', '52000000-0000-4000-8000-000000000003', 'ongoing_retry', 'TRY AGAIN', 'retry', 0, null, 0, 20, 1, 999, true, now(), now()),
  ('53000000-0000-4000-8000-000000000007', '52000000-0000-4000-8000-000000000003', 'ongoing_letter', 'LETTER', 'letter', 0, null, 0, 15, 2, 7, true, now(), now()),
  ('53000000-0000-4000-8000-000000000008', '52000000-0000-4000-8000-000000000003', 'ongoing_cash_500', '₦500', 'cash', 500, null, 0, 6, 3, 2, true, now(), now()),
  ('53000000-0000-4000-8000-000000000009', '52000000-0000-4000-8000-000000000003', 'ongoing_cash_1000', '₦1,000', 'cash', 1000, null, 0, 2, 4, 1, true, now(), now())
on conflict (id) do nothing;

insert into public.spin_players (
  id, identity_id, phone_number, full_name, email, referral_code,
  referred_by_identity_id, referred_by_referral_code, spins_remaining,
  wallet_balance, total_referrals_count, total_cash_won, cashout_target,
  spin_sequence_step, dm_bonus_claimed, letters_unlocked,
  letter_challenge_completed, last_prize_won, last_prize_type,
  cashout_eligible, total_cash_off_won, created_at, updated_at
)
values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '+2348000000001', 'Amina Yusuf', 'amina.yusuf@example.test', 'AMINA25', null, null, 3, 100, 1, 100, 1000, 1, false, '{}'::text[], false, '₦100', 'cash', false, 500, now() - interval '12 days', now()),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '+2348000000002', 'Tunde Balogun', 'tunde.balogun@example.test', 'TUNDE25', '20000000-0000-4000-8000-000000000001', 'AMINA25', 2, 450, 0, 450, 1000, 3, true, array['EM','MY'], false, 'MY', 'letter', false, 0, now() - interval '10 days', now()),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '+2348000000003', 'Ifeoma Okeke', 'ifeoma.okeke@example.test', 'IFEOMA25', '20000000-0000-4000-8000-000000000001', 'AMINA25', 1, 0, 0, 0, 1000, 0, false, '{}'::text[], false, null, null, false, 0, now() - interval '8 days', now()),
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '+2348000000004', 'Chinedu Nwosu', 'chinedu.nwosu@example.test', 'CHINEDU25', null, null, 0, 1200, 2, 1200, 1000, 8, true, array['EM','MY','TE','CH','NO','LO','GY'], true, '₦500', 'cash', true, 200, now() - interval '6 days', now()),
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '+2348000000005', 'Zainab Bello', 'zainab.bello@example.test', 'ZAINAB25', '20000000-0000-4000-8000-000000000002', 'TUNDE25', 0, 0, 0, 0, 1000, 1, false, array['EM'], false, 'EM', 'letter', false, 0, now() - interval '4 days', now())
on conflict (id) do nothing;

insert into public.cash_off_accounts (
  identity_id, balance, total_credited, total_debited,
  total_redeemed, total_refunded, status, created_at, updated_at
)
values
  ('20000000-0000-4000-8000-000000000001', 500, 700, 200, 200, 0, 'active', now() - interval '12 days', now()),
  ('20000000-0000-4000-8000-000000000002', 1500, 1500, 0, 0, 0, 'active', now() - interval '10 days', now()),
  ('20000000-0000-4000-8000-000000000003', 0, 0, 0, 0, 0, 'active', now() - interval '8 days', now()),
  ('20000000-0000-4000-8000-000000000004', 200, 200, 0, 0, 0, 'frozen', now() - interval '6 days', now()),
  ('20000000-0000-4000-8000-000000000005', 0, 0, 0, 0, 0, 'active', now() - interval '4 days', now())
on conflict (identity_id) do update
set balance = excluded.balance,
    total_credited = excluded.total_credited,
    total_debited = excluded.total_debited,
    total_redeemed = excluded.total_redeemed,
    total_refunded = excluded.total_refunded,
    status = excluded.status,
    updated_at = excluded.updated_at;

insert into public.cash_off_transactions (
  id, identity_id, direction, transaction_type, amount,
  balance_before, balance_after, source_system, source_reference,
  order_reference, created_by, reason, metadata, idempotency_key, created_at
)
values
  ('5a000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'credit', 'promotion', 700, 0, 700, 'spin_cash_challenge', 'challenge-test-amina', null, null, 'Expired cash challenge converted to Cash-Off.', '{"test":true}'::jsonb, 'seed-cashoff-amina-credit', now() - interval '5 days'),
  ('5a000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'debit', 'order_redemption', 200, 700, 500, 'website_cart', null, 'ORDER-TEST-0001', '00000000-0000-4000-8000-000000000001', 'Applied Cash-Off to test order.', '{"product_id":"31000000-0000-4000-8000-000000000001"}'::jsonb, 'seed-cashoff-amina-debit', now() - interval '2 days'),
  ('5a000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'credit', 'admin_credit', 1500, 0, 1500, 'emmy40_admin', null, null, '00000000-0000-4000-8000-000000000001', 'Synthetic admin credit.', '{"panel":"emmy40"}'::jsonb, 'seed-cashoff-tunde-credit', now() - interval '1 day'),
  ('5a000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'credit', 'spin_reward', 200, 0, 200, 'spin', 'spin-test-chinedu', null, null, 'Synthetic spin reward.', '{"test":true}'::jsonb, 'seed-cashoff-chinedu-credit', now() - interval '6 hours')
on conflict (id) do nothing;

insert into public.cash_off_source_balances (
  source_system, source_account_key, identity_id, imported_balance,
  sync_version, source_updated_at, first_synced_at, last_synced_at, metadata
)
values
  ('legacy_spin', 'AMINA25', '20000000-0000-4000-8000-000000000001', 500, 1, now() - interval '5 days', now() - interval '5 days', now(), '{"test":true}'::jsonb),
  ('ambassador', 'ADA25-AMINA', '20000000-0000-4000-8000-000000000001', 200, 1, now() - interval '2 days', now() - interval '2 days', now(), '{"test":true}'::jsonb),
  ('legacy_spin', 'TUNDE25', '20000000-0000-4000-8000-000000000002', 1500, 2, now() - interval '1 day', now() - interval '1 day', now(), '{"test":true}'::jsonb)
on conflict (source_system, source_account_key) do update
set imported_balance = excluded.imported_balance,
    sync_version = excluded.sync_version,
    last_synced_at = excluded.last_synced_at,
    metadata = excluded.metadata;

insert into public.spin_cash_challenges (
  id, identity_id, spin_player_id, cycle_number, status, started_at,
  expires_at, cash_balance, converted_cash_off_amount,
  processed_at, last_credit_at, created_at, updated_at
)
values
  ('57000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 1, 'converted_to_cash_off', now() - interval '6 days', now() - interval '5 days', 700, 700, now() - interval '5 days', now() - interval '5 days', now() - interval '6 days', now()),
  ('57000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 1, 'active', now() - interval '6 hours', now() + interval '18 hours', 450, 0, null, now() - interval '1 hour', now() - interval '6 hours', now()),
  ('57000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 1, 'cash_eligible', now() - interval '2 days', now() - interval '1 day', 1200, 0, now() - interval '1 day', now() - interval '1 day', now() - interval '2 days', now())
on conflict (id) do nothing;

insert into public.spin_logs (
  id, identity_id, spin_player_id, prize_id, result_label, result_type,
  cash_amount, letter_code, wallet_before, wallet_after, reward_mode,
  request_id, cash_off_before, cash_off_after, spin_number,
  spin_rule_group_key, spin_rule_item_key, cash_challenge_id,
  cash_challenge_credit, cash_challenge_balance_after,
  cash_challenge_expires_at, created_at
)
values
  ('54000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000005', '₦100', 'cash', 100, null, 0, 100, 'cash_challenge', '54000000-0000-4000-8000-000000000101', 0, 0, 1, 'first_spin', 'first_cash_100', '57000000-0000-4000-8000-000000000001', 100, 100, now() - interval '5 days', now() - interval '6 days'),
  ('54000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000003', 'EM', 'letter', 0, 'EM', 250, 250, 'canonical_prize', '54000000-0000-4000-8000-000000000102', 1500, 1500, 2, 'early_spins', 'early_letter', '57000000-0000-4000-8000-000000000002', 0, 250, now() + interval '18 hours', now() - interval '3 hours'),
  ('54000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000006', '₦200', 'cash', 200, null, 250, 450, 'cash_challenge', '54000000-0000-4000-8000-000000000103', 1500, 1500, 3, 'early_spins', 'early_cash_200', '57000000-0000-4000-8000-000000000002', 200, 450, now() + interval '18 hours', now() - interval '1 hour'),
  ('54000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000007', '₦500', 'cash', 500, null, 700, 1200, 'cash_challenge', '54000000-0000-4000-8000-000000000104', 200, 200, 8, 'ongoing_spins', 'ongoing_cash_500', '57000000-0000-4000-8000-000000000003', 500, 1200, now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.spin_cash_challenge_credits (
  id, challenge_id, identity_id, spin_player_id, spin_log_id, request_id,
  amount_won, amount_credited, balance_before, balance_after, created_at
)
values
  ('58000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000101', 100, 100, 0, 100, now() - interval '6 days'),
  ('58000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000103', 200, 200, 250, 450, now() - interval '1 hour'),
  ('58000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000104', 500, 500, 700, 1200, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.spin_user_prizes (
  id, identity_id, spin_player_id, prize_id, prize_label, status,
  claimed_at, result_type, cash_amount, letter_code, wallet_after,
  claim_message, reward_mode, cash_off_after, cash_off_transaction_id, created_at
)
values
  ('55000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000005', '₦100', 'available', null, 'cash', 100, null, 100, '₦100 was added to your 24-hour cash challenge.', 'cash_challenge', 500, null, now() - interval '6 days'),
  ('55000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000003', 'EM', 'claimed', now() - interval '2 hours', 'letter', 0, 'EM', 250, 'I unlocked EM on the EmmyTech Spin Wheel.', 'canonical_prize', 1500, null, now() - interval '3 hours'),
  ('55000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000006', '₦200', 'available', null, 'cash', 200, null, 450, '₦200 was added to your 24-hour cash challenge.', 'cash_challenge', 1500, null, now() - interval '1 hour'),
  ('55000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000007', '₦500', 'pending', null, 'cash', 500, null, 1200, 'Cash target reached; withdrawal review pending.', 'cash_challenge', 200, '5a000000-0000-4000-8000-000000000004', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.spin_user_rule_usage (
  id, identity_id, spin_player_id, spin_rule_item_id, spin_number, created_at
)
values
  ('56000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 1, now() - interval '6 days'),
  ('56000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000004', 2, now() - interval '3 hours'),
  ('56000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000005', 3, now() - interval '1 hour'),
  ('56000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000008', 8, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.spin_referrals (
  id, referrer_spin_player_id, referred_spin_player_id,
  referrer_identity_id, referred_identity_id, invitee_phone,
  invitee_email, status, reward_granted, reward_spin_amount,
  rewarded_at, created_at
)
values
  ('59000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '+2348000000002', 'tunde.balogun@example.test', 'completed', true, 1, now() - interval '9 days', now() - interval '10 days'),
  ('59000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '+2348000000003', 'ifeoma.okeke@example.test', 'pending', false, 1, null, now() - interval '8 days')
on conflict (id) do nothing;

insert into public.spin_referral_awards (
  id, referrer_spin_player_id, referred_spin_player_id,
  referrer_identity_id, referred_identity_id, referral_code,
  spins_awarded, created_at
)
values (
  '5b000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'AMINA25', 1, now() - interval '9 days'
)
on conflict (id) do nothing;

insert into public.spin_transactions (
  id, identity_id, spin_player_id, amount, type, status,
  reference_id, created_at
)
values
  ('5c000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 100, 'cash_win', 'completed', '54000000-0000-4000-8000-000000000001', now() - interval '6 days'),
  ('5c000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', -1000, 'cashout', 'pending', '5d000000-0000-4000-8000-000000000001', now() - interval '12 hours')
on conflict (id) do nothing;

insert into public.spin_cashout_requests (
  id, identity_id, spin_player_id, amount, status,
  requested_at, paid_at, admin_note, created_at
)
values
  ('5d000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', 1000, 'pending', now() - interval '12 hours', null, 'Awaiting local test review.', now() - interval '12 hours'),
  ('5d000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 500, 'paid', now() - interval '4 days', now() - interval '3 days', 'Synthetic paid cashout.', now() - interval '4 days')
on conflict (id) do nothing;

insert into public.spin_dm_clicks (
  id, identity_id, spin_player_id, spin_log_id, prize_label,
  claim_message, bonus_spin_granted, created_at
)
values
  ('5e000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000002', 'EM', 'I unlocked EM on the EmmyTech Spin Wheel.', true, now() - interval '2 hours'),
  ('5e000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '54000000-0000-4000-8000-000000000004', '₦500', 'I reached my cash challenge target.', false, now() - interval '1 day')
on conflict (id) do nothing;

insert into public.canonical_wheel_sessions (
  token_hash, visitor_id, identity_id, spin_player_id,
  created_at, expires_at, last_seen_at
)
values
  ('test-session-amina-hash', 'visitor-test-001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', now() - interval '2 hours', now() + interval '30 days', now()),
  ('test-session-tunde-hash', 'visitor-test-002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', now() - interval '1 hour', now() + interval '30 days', now())
on conflict (token_hash) do update
set last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at;

insert into public.website_wheel_handoffs (
  token_hash, visitor_id, product_id, source_path,
  created_at, expires_at, consumed_at
)
values
  ('test-handoff-active-hash', 'visitor-test-001', '31000000-0000-4000-8000-000000000001', '/products/test-emmyphone-x1', now() - interval '2 minutes', now() + interval '8 minutes', null),
  ('test-handoff-consumed-hash', 'visitor-test-002', '31000000-0000-4000-8000-000000000003', '/products/test-solar-power-kit-15kva', now() - interval '1 hour', now() - interval '50 minutes', now() - interval '55 minutes')
on conflict (token_hash) do nothing;

-- SMS outreach test campaign.
insert into public.sms_leads (
  id, source_player_id, first_name, full_name, phone_normalized,
  joined_at, whatsapp_outreach_status, outreach_status_source,
  created_at, updated_at
)
values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Amina', 'Amina Yusuf', '+2348000000001', now() - interval '12 days', 'not_messaged', 'seed', now(), now()),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Tunde', 'Tunde Balogun', '+2348000000002', now() - interval '10 days', 'messaged', 'seed', now(), now()),
  ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'Ifeoma', 'Ifeoma Okeke', '+2348000000003', now() - interval '8 days', 'messaged_us_before', 'seed', now(), now())
on conflict (id) do nothing;

insert into public.sms_campaigns (
  id, campaign_key, name, message_template, whatsapp_number,
  whatsapp_message, public_base_url, status, activated_at,
  created_at, updated_at
)
values (
  '71000000-0000-4000-8000-000000000001',
  'LOCAL-SPIN-RETURN-01',
  'Return to Spin - Local Test',
  'Hi {{first_name}}, your EmmyTech test spins are waiting: {{tracking_url}}',
  '2348000000000',
  'Hello EmmyTech, I want to claim my local test spins.',
  'http://localhost:3000',
  'active', now() - interval '1 day', now() - interval '2 days', now()
)
on conflict (id) do nothing;

insert into public.sms_campaign_recipients (
  id, campaign_id, lead_id, tracking_token, sms_status,
  exported_at, sent_at, delivered_at, clicked_at, click_count,
  whatsapp_claimed_at, created_at, updated_at
)
values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'testtoken001', 'selected', null, null, null, null, 0, null, now(), now()),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'testtoken002', 'clicked', now() - interval '1 day', now() - interval '1 day', now() - interval '23 hours', now() - interval '2 hours', 2, null, now() - interval '1 day', now()),
  ('72000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', 'testtoken003', 'claimed', now() - interval '1 day', now() - interval '1 day', now() - interval '23 hours', now() - interval '5 hours', 1, now() - interval '4 hours', now() - interval '1 day', now())
on conflict (id) do nothing;

commit;
