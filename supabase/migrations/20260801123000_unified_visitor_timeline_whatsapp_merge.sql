begin;

-- ---------------------------------------------------------------------------
-- Unified visitor, WhatsApp, Spin Wheel and lead intelligence foundation.
-- This migration is intentionally additive and can be tested in Docker first.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_contact_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_digits = '' then
    return null;
  end if;

  if length(v_digits) = 11 and left(v_digits, 1) = '0' then
    return '+234' || substring(v_digits from 2);
  end if;

  if length(v_digits) = 13 and left(v_digits, 3) = '234' then
    return '+' || v_digits;
  end if;

  if length(v_digits) = 10 then
    return '+234' || v_digits;
  end if;

  if length(v_digits) between 8 and 15 then
    return '+' || v_digits;
  end if;

  return null;
end;
$$;

alter table public.referral_clicks
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table public.website_events
  add column if not exists identity_id uuid references public.identities(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists page_url text,
  add column if not exists search_query text,
  add column if not exists results_count integer,
  add column if not exists ip_signature text,
  add column if not exists device_signature text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.website_events
  drop constraint if exists website_events_event_type_check;

alter table public.website_events
  add constraint website_events_event_type_check
  check (
    event_type = any (
      array[
        'website_visited'::text,
        'page_viewed'::text,
        'product_searched'::text,
        'product_viewed'::text,
        'product_quick_viewed'::text,
        'product_shared'::text,
        'add_to_cart'::text,
        'remove_from_cart'::text,
        'whatsapp_purchase_clicked'::text,
        'spin_opened_from_product'::text,
        'reward_viewed'::text,
        'reward_applied'::text,
        'cash_off_product_selected'::text,
        'cash_off_product_changed'::text,
        'cash_off_product_removed'::text,
        'full_wheel_opened_from_overlay'::text,
        'full_wheel_opened_from_cart'::text,
        'returned_from_full_wheel'::text
      ]
    )
  );

create index if not exists website_events_lead_created_idx
  on public.website_events (lead_id, created_at desc)
  where lead_id is not null;

create index if not exists website_events_identity_created_idx
  on public.website_events (identity_id, created_at desc)
  where identity_id is not null;

create index if not exists referral_clicks_source_created_idx
  on public.referral_clicks (source, created_at desc);

alter table public.identity_match_suggestions
  add column if not exists reason_summary text,
  add column if not exists same_fields jsonb not null default '[]'::jsonb,
  add column if not exists different_fields jsonb not null default '[]'::jsonb,
  add column if not exists recommendation text,
  add column if not exists impact_summary jsonb not null default '{}'::jsonb,
  add column if not exists resolution_note text;

create table if not exists public.whatsapp_intake_audit (
  id uuid primary key default gen_random_uuid(),
  referral_click_id uuid references public.referral_clicks(id) on delete set null,
  entered_phone text,
  normalized_phone text,
  action text not null check (
    action in ('attach_existing', 'create_new', 'keep_separate', 'attach_activity_only')
  ),
  source_lead_id uuid references public.leads(id) on delete set null,
  target_lead_id uuid references public.leads(id) on delete set null,
  reason text not null check (length(trim(reason)) >= 3),
  match_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_intake_audit_click_unique
  on public.whatsapp_intake_audit (referral_click_id)
  where referral_click_id is not null;

alter table public.whatsapp_intake_audit enable row level security;

revoke all on table public.whatsapp_intake_audit from public, anon;
grant select, insert on table public.whatsapp_intake_audit to authenticated;
grant all on table public.whatsapp_intake_audit to service_role;

drop policy if exists "Admins manage WhatsApp intake audit"
  on public.whatsapp_intake_audit;
create policy "Admins manage WhatsApp intake audit"
  on public.whatsapp_intake_audit
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'
    )
  );

create or replace function public.attach_visitor_history_to_lead_v3(
  p_visitor_id text,
  p_identity_id uuid,
  p_lead_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visitor text := nullif(trim(coalesce(p_visitor_id, '')), '');
  v_lead public.leads%rowtype;
  v_visitor_ids jsonb;
begin
  if p_lead_id is null or v_visitor is null then
    return;
  end if;

  select *
  into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    return;
  end if;

  v_visitor_ids := coalesce(v_lead.visitor_ids, '[]'::jsonb);
  if not (v_visitor_ids @> jsonb_build_array(v_visitor)) then
    v_visitor_ids := v_visitor_ids || jsonb_build_array(v_visitor);
  end if;

  update public.leads
  set
    identity_id = coalesce(identity_id, p_identity_id),
    visitor_id = coalesce(visitor_id, v_visitor),
    visitor_ids = v_visitor_ids,
    updated_at = now()
  where id = p_lead_id;

  update public.website_events
  set
    identity_id = coalesce(identity_id, p_identity_id),
    lead_id = coalesce(lead_id, p_lead_id)
  where visitor_id = v_visitor;

  update public.referral_clicks
  set
    identity_id = coalesce(identity_id, p_identity_id),
    lead_id = coalesce(lead_id, p_lead_id)
  where visitor_id = v_visitor;
end;
$$;

create or replace function public.track_website_event_v3(
  p_visitor_id text,
  p_event_type text,
  p_page_url text default null,
  p_search_query text default null,
  p_results_count integer default null,
  p_product_id uuid default null,
  p_referral_code text default null,
  p_ip_address text default null,
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_event_type text := trim(coalesce(p_event_type, ''));
  v_code text := lower(trim(coalesce(p_referral_code, '')));
  v_ambassador_id uuid;
  v_identity_id uuid;
  v_lead_id uuid;
  v_ip_signature text := case
    when nullif(trim(coalesce(p_ip_address, '')), '') is null then null
    else md5(trim(p_ip_address))
  end;
  v_device_signature text := case
    when nullif(trim(coalesce(p_user_agent, '')), '') is null then null
    else md5(trim(p_user_agent))
  end;
  v_event_id uuid;
begin
  if v_visitor = ''
     or length(v_visitor) > 200
     or v_visitor !~ '^[a-z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  if v_event_type not in (
    'website_visited',
    'page_viewed',
    'product_searched',
    'product_viewed',
    'product_quick_viewed',
    'product_shared',
    'add_to_cart',
    'remove_from_cart',
    'whatsapp_purchase_clicked',
    'spin_opened_from_product',
    'reward_viewed',
    'reward_applied',
    'cash_off_product_selected',
    'cash_off_product_changed',
    'cash_off_product_removed',
    'full_wheel_opened_from_overlay',
    'full_wheel_opened_from_cart',
    'returned_from_full_wheel'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  end if;

  if v_code <> '' then
    select a.id
    into v_ambassador_id
    from public.ambassadors a
    where a.status = 'active'
      and (
        lower(trim(a.referral_code)) = v_code
        or lower(trim(coalesce(a.custom_referral_code, ''))) = v_code
      )
    order by a.created_at asc
    limit 1;
  end if;

  if v_ambassador_id is null then
    select vs.ambassador_id
    into v_ambassador_id
    from public.visitor_sessions vs
    where vs.visitor_id = v_visitor;
  end if;

  select sig.identity_id
  into v_identity_id
  from public.identity_signals sig
  where sig.signal_type = 'visitor_id'
    and sig.signal_value = lower(v_visitor)
  order by sig.verified desc, sig.last_seen_at desc
  limit 1;

  select l.id
  into v_lead_id
  from public.leads l
  where l.merged_into_lead_id is null
    and (
      l.identity_id = v_identity_id
      or l.visitor_id = v_visitor
      or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_visitor)
    )
  order by
    coalesce(l.approved_as_lead, false) desc,
    l.created_at asc
  limit 1;

  insert into public.visitor_sessions (
    visitor_id,
    ambassador_id,
    referral_code,
    ip_address,
    user_agent,
    first_seen,
    last_seen,
    created_at
  )
  values (
    v_visitor,
    v_ambassador_id,
    nullif(v_code, ''),
    p_ip_address,
    p_user_agent,
    now(),
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set
    ambassador_id = coalesce(public.visitor_sessions.ambassador_id, excluded.ambassador_id),
    referral_code = coalesce(public.visitor_sessions.referral_code, excluded.referral_code),
    ip_address = coalesce(excluded.ip_address, public.visitor_sessions.ip_address),
    user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
    last_seen = now();

  insert into public.website_events (
    visitor_id,
    product_id,
    ambassador_id,
    identity_id,
    lead_id,
    event_type,
    quantity,
    source_page,
    page_url,
    search_query,
    results_count,
    ip_signature,
    device_signature,
    metadata,
    created_at
  )
  values (
    v_visitor,
    p_product_id,
    v_ambassador_id,
    v_identity_id,
    v_lead_id,
    v_event_type,
    1,
    left(coalesce(p_page_url, ''), 500),
    left(coalesce(p_page_url, ''), 1000),
    nullif(left(trim(coalesce(p_search_query, '')), 300), ''),
    case when p_results_count is null then null else greatest(p_results_count, 0) end,
    v_ip_signature,
    v_device_signature,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  returning id into v_event_id;

  if v_lead_id is not null then
    perform public.attach_visitor_history_to_lead_v3(
      v_visitor,
      v_identity_id,
      v_lead_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'identity_id', v_identity_id,
    'lead_id', v_lead_id,
    'ambassador_id', v_ambassador_id,
    'identified_lead', v_lead_id is not null
  );
end;
$$;

create or replace function public.track_whatsapp_referral_click_v3(
  p_referral_code text,
  p_ip_address text,
  p_user_agent text,
  p_visitor_id text,
  p_source_page text default null,
  p_product_id uuid default null,
  p_search_query text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := lower(trim(coalesce(p_referral_code, '')));
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_ambassador_id uuid;
  v_identity_id uuid;
  v_existing_lead public.leads%rowtype;
  v_lead_id uuid;
  v_click_id uuid;
  v_ip_signature text := case
    when nullif(trim(coalesce(p_ip_address, '')), '') is null then null
    else md5(trim(p_ip_address))
  end;
  v_device_signature text := case
    when nullif(trim(coalesce(p_user_agent, '')), '') is null then null
    else md5(trim(p_user_agent))
  end;
  v_signals jsonb;
  v_visitor_ids jsonb;
begin
  if v_visitor = ''
     or length(v_visitor) > 200
     or v_visitor !~ '^[a-z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  select a.id
  into v_ambassador_id
  from public.ambassadors a
  where a.status = 'active'
    and (
      lower(trim(a.referral_code)) = v_code
      or lower(trim(coalesce(a.custom_referral_code, ''))) = v_code
    )
  order by a.created_at asc
  limit 1;

  if v_ambassador_id is null then
    return jsonb_build_object('ok', false, 'reason', 'ambassador_not_found');
  end if;

  -- Reuse only the exact first-party visitor identity here. IP and device
  -- evidence are intentionally excluded from automatic identity matching.
  -- They remain suggestion signals for Admin review and can never merge people
  -- by themselves.
  select sig.identity_id
  into v_identity_id
  from public.identity_signals sig
  where sig.signal_type = 'visitor_id'
    and lower(trim(sig.signal_value)) = lower(v_visitor)
  order by sig.verified desc, sig.last_seen_at desc
  limit 1;

  if v_identity_id is null then
    v_signals := jsonb_build_array(
      jsonb_build_object('type', 'visitor_id', 'value', v_visitor)
    );

    v_identity_id := public.upsert_identity_from_signals(
      v_signals,
      null,
      null,
      null,
      'whatsapp_referral_click'
    );
  end if;

  insert into public.identity_signals (
    identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified,
    source
  )
  select
    v_identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    false,
    'whatsapp_referral_click'
  from (
    values
      ('ip_signature'::text, v_ip_signature, 20),
      ('device_signature'::text, v_device_signature, 35)
  ) as weak_signals(signal_type, signal_value, confidence_weight)
  where signal_value is not null
  on conflict (identity_id, signal_type, signal_value)
  do update set
    last_seen_at = now(),
    seen_count = public.identity_signals.seen_count + 1,
    confidence_weight = greatest(
      public.identity_signals.confidence_weight,
      excluded.confidence_weight
    );

  select l.*
  into v_existing_lead
  from public.leads l
  where l.merged_into_lead_id is null
    and (
      l.identity_id = v_identity_id
      or l.visitor_id = v_visitor
      or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_visitor)
    )
  order by
    coalesce(l.approved_as_lead, false) desc,
    l.created_at asc
  limit 1
  for update;

  if v_existing_lead.id is not null then
    v_lead_id := v_existing_lead.id;

    if v_existing_lead.ambassador_id is distinct from v_ambassador_id then
      perform public.detect_identity_ambassador_conflict(
        v_identity_id,
        v_ambassador_id
      );
    end if;

    v_visitor_ids := coalesce(v_existing_lead.visitor_ids, '[]'::jsonb);
    if not (v_visitor_ids @> jsonb_build_array(v_visitor)) then
      v_visitor_ids := v_visitor_ids || jsonb_build_array(v_visitor);
    end if;

    update public.leads
    set
      visitor_id = coalesce(visitor_id, v_visitor),
      visitor_ids = v_visitor_ids,
      click_count = coalesce(click_count, 0) + 1,
      last_clicked_at = now(),
      source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object(
        'whatsapp_clicked', true,
        'last_whatsapp_visitor_id', v_visitor
      ),
      updated_at = now()
    where id = v_existing_lead.id;
  else
    insert into public.leads (
      ambassador_id,
      identity_id,
      source,
      source_detail,
      customer_name,
      customer_phone,
      referral_code_used,
      status,
      funnel_stage,
      lead_approval_status,
      approved_as_lead,
      visitor_id,
      ip_signature,
      device_signature,
      click_count,
      last_clicked_at,
      duplicate_status,
      confidence_score,
      visitor_ids,
      ip_signatures,
      device_signatures,
      lead_intelligence_status,
      needs_merge_review,
      created_at,
      updated_at
    )
    values (
      v_ambassador_id,
      v_identity_id,
      'whatsapp',
      jsonb_build_object(
        'channel', 'whatsapp',
        'visitor_id', v_visitor,
        'source_page', p_source_page,
        'product_id', p_product_id,
        'search_query', p_search_query
      ),
      'WhatsApp Lead',
      'Not provided',
      p_referral_code,
      'new',
      'new_lead',
      'pending',
      false,
      v_visitor,
      v_ip_signature,
      v_device_signature,
      1,
      now(),
      'unique',
      80,
      jsonb_build_array(v_visitor),
      jsonb_build_array(v_ip_signature),
      jsonb_build_array(v_device_signature),
      'identity_linked',
      false,
      now(),
      now()
    )
    returning id into v_lead_id;
  end if;

  insert into public.referral_clicks (
    ambassador_id,
    referral_code,
    source,
    ip_address,
    user_agent,
    visitor_fingerprint,
    visitor_id,
    identity_id,
    lead_id,
    match_score,
    match_reason,
    context,
    created_at,
    counted_as_lead
  )
  values (
    v_ambassador_id,
    p_referral_code,
    'whatsapp',
    p_ip_address,
    p_user_agent,
    md5(v_visitor || ':' || coalesce(p_user_agent, '')),
    v_visitor,
    v_identity_id,
    v_lead_id,
    case when v_existing_lead.id is null then 80 else 100 end,
    case
      when v_existing_lead.id is null then 'pending_whatsapp_identity'
      else 'matched_existing_identity'
    end,
    jsonb_build_object(
      'source_page', p_source_page,
      'product_id', p_product_id,
      'search_query', p_search_query,
      'ip_signature', v_ip_signature,
      'device_signature', v_device_signature
    ),
    now(),
    false
  )
  returning id into v_click_id;

  insert into public.visitor_sessions (
    visitor_id,
    ambassador_id,
    referral_code,
    ip_address,
    user_agent,
    first_seen,
    last_seen,
    created_at
  )
  values (
    v_visitor,
    v_ambassador_id,
    p_referral_code,
    p_ip_address,
    p_user_agent,
    now(),
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set
    ambassador_id = coalesce(public.visitor_sessions.ambassador_id, excluded.ambassador_id),
    referral_code = coalesce(public.visitor_sessions.referral_code, excluded.referral_code),
    ip_address = coalesce(excluded.ip_address, public.visitor_sessions.ip_address),
    user_agent = coalesce(excluded.user_agent, public.visitor_sessions.user_agent),
    last_seen = now();

  insert into public.lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_at
  )
  values (
    v_lead_id,
    coalesce(v_existing_lead.ambassador_id, v_ambassador_id),
    'whatsapp_link_clicked',
    'WhatsApp referral link opened',
    case
      when v_existing_lead.id is null then
        'The visitor opened WhatsApp. Their number is still waiting for staff confirmation.'
      else
        'A known lead opened the Ambassador WhatsApp referral link.'
    end,
    jsonb_build_object(
      'referral_click_id', v_click_id,
      'visitor_id', v_visitor,
      'clicked_ambassador_id', v_ambassador_id,
      'source_page', p_source_page,
      'product_id', p_product_id,
      'search_query', p_search_query
    ),
    now()
  );

  perform public.attach_visitor_history_to_lead_v3(
    v_visitor,
    v_identity_id,
    v_lead_id
  );

  return jsonb_build_object(
    'ok', true,
    'referral_click_id', v_click_id,
    'lead_id', v_lead_id,
    'identity_id', v_identity_id,
    'existing_lead', v_existing_lead.id is not null,
    'lead_count_added', false
  );
end;
$$;

create or replace function public.get_unified_lead_timeline_v3(p_lead_id uuid)
returns table (
  event_source text,
  event_type text,
  title text,
  description text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_is_admin boolean := false;
  v_is_owner boolean := false;
begin
  select *
  into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    raise exception 'Lead not found';
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ) into v_is_admin;

  select exists (
    select 1
    from public.ambassadors a
    where a.id = v_lead.ambassador_id
      and a.user_id = auth.uid()
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'Not allowed to view this timeline';
  end if;

  return query
  with related_leads as (
    select l.id
    from public.leads l
    where (
      l.id = p_lead_id
      or (
        v_lead.identity_id is not null
        and l.identity_id = v_lead.identity_id
      )
      or l.merged_into_lead_id = p_lead_id
    )
      and (
        v_is_admin
        or l.ambassador_id is not distinct from v_lead.ambassador_id
      )
  ),
  visitor_values as (
    select distinct value #>> '{}' as visitor_id
    from (
      select to_jsonb(l.visitor_id) as value
      from public.leads l
      where l.id in (select id from related_leads)
        and l.visitor_id is not null
      union all
      select visitor_value.value
      from public.leads l
      cross join lateral jsonb_array_elements(
        coalesce(l.visitor_ids, '[]'::jsonb)
      ) visitor_value(value)
      where l.id in (select id from related_leads)
    ) values_union
    where value is not null
  ),
  timeline as (
    select
      'lead'::text as event_source,
      le.event_type,
      le.event_title as title,
      le.event_description as description,
      coalesce(le.event_data, '{}'::jsonb) as metadata,
      le.created_at
    from public.lead_events le
    where le.lead_id in (select id from related_leads)
      and le.event_type <> 'whatsapp_link_clicked'
      and (
        v_is_admin
        or le.event_type not in (
          'duplicate_identity_merged',
          'possible_identity_activity_attached',
          'identity_merge_reviewed',
          'match_reviewed'
        )
      )

    union all

    select
      'identity'::text,
      ie.event_type,
      ie.title,
      ie.description,
      coalesce(ie.metadata, '{}'::jsonb),
      ie.created_at
    from public.identity_events ie
    where v_is_admin
      and v_lead.identity_id is not null
      and ie.identity_id = v_lead.identity_id

    union all

    select
      'website'::text,
      we.event_type,
      case we.event_type
        when 'website_visited' then 'Website visited'
        when 'page_viewed' then 'Page viewed'
        when 'product_searched' then 'Product searched'
        when 'product_viewed' then 'Product viewed'
        when 'product_quick_viewed' then 'Product quick-viewed'
        when 'product_shared' then 'Product shared'
        when 'add_to_cart' then 'Product added to cart'
        when 'remove_from_cart' then 'Product removed from cart'
        when 'whatsapp_purchase_clicked' then 'WhatsApp purchase clicked'
        else initcap(replace(we.event_type, '_', ' '))
      end as title,
      case
        when we.event_type = 'product_searched' then
          'Searched for “' || coalesce(we.search_query, 'a product') || '”' ||
          case
            when we.results_count is null then ''
            else ' and saw ' || we.results_count::text || ' result(s).'
          end
        when nullif(we.page_url, '') is not null then we.page_url
        else 'Website activity recorded.'
      end as description,
      coalesce(we.metadata, '{}'::jsonb) || jsonb_build_object(
        'page_url', we.page_url,
        'search_query', we.search_query,
        'results_count', we.results_count,
        'product_id', we.product_id,
        'visitor_id', we.visitor_id
      ) as metadata,
      we.created_at
    from public.website_events we
    where (
      we.lead_id in (select id from related_leads)
      or (v_lead.identity_id is not null and we.identity_id = v_lead.identity_id)
      or we.visitor_id in (select visitor_id from visitor_values)
    )
      and (
        v_is_admin
        or we.ambassador_id is null
        or we.ambassador_id = v_lead.ambassador_id
      )

    union all

    select
      'referral'::text,
      case
        when rc.source = 'spin_wheel' then 'spin_link_clicked'
        else 'whatsapp_link_clicked'
      end,
      case
        when rc.source = 'spin_wheel' then 'Spin Wheel referral link opened'
        else 'WhatsApp referral link opened'
      end,
      case
        when rc.source = 'spin_wheel' then 'The visitor opened the Ambassador Spin Wheel link.'
        else 'The visitor opened the Ambassador WhatsApp link.'
      end,
      coalesce(rc.context, '{}'::jsonb) || jsonb_build_object(
        'referral_click_id', rc.id,
        'visitor_id', rc.visitor_id,
        'source', rc.source,
        'counted_as_lead', rc.counted_as_lead,
        'match_reason', rc.match_reason
      ),
      rc.created_at
    from public.referral_clicks rc
    where (
      rc.lead_id in (select id from related_leads)
      or (v_lead.identity_id is not null and rc.identity_id = v_lead.identity_id)
      or rc.visitor_id in (select visitor_id from visitor_values)
    )
      and (
        v_is_admin
        or rc.ambassador_id = v_lead.ambassador_id
      )
  )
  select *
  from timeline
  order by timeline.created_at desc;
end;
$$;

create or replace function public.get_explained_merge_suggestions_v3(p_lead_id uuid)
returns table (
  suggestion_id uuid,
  candidate_lead_id uuid,
  candidate_name text,
  candidate_phone text,
  candidate_email text,
  candidate_ambassador text,
  confidence integer,
  reason_summary text,
  same_fields jsonb,
  different_fields jsonb,
  recommendation text,
  impact_summary jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_is_admin boolean := false;
begin
  select *
  into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    raise exception 'Lead not found';
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Only admins can review merge suggestions';
  end if;

  if v_lead.identity_id is null then
    return;
  end if;

  perform public.generate_identity_match_suggestions();

  return query
  with suggestions as (
    select
      ims.*,
      case
        when ims.identity_a = v_lead.identity_id then ims.identity_b
        else ims.identity_a
      end as other_identity_id
    from public.identity_match_suggestions ims
    where ims.decision = 'pending'
      and (
        ims.identity_a = v_lead.identity_id
        or ims.identity_b = v_lead.identity_id
      )
  ),
  candidates as (
    select distinct on (s.id)
      s.id as suggestion_id,
      s.confidence,
      s.reasons,
      s.created_at,
      s.other_identity_id,
      l.id as candidate_lead_id,
      l.customer_name,
      l.customer_phone,
      l.customer_email,
      l.ambassador_id,
      l.status,
      l.approved_as_lead,
      l.approved_at as candidate_approved_at,
      a.display_name,
      a.ambassador_tag,
      u.name as ambassador_user_name,
      i.primary_name,
      i.primary_phone,
      i.primary_email
    from suggestions s
    join public.identities i on i.id = s.other_identity_id
    left join public.leads l
      on l.identity_id = s.other_identity_id
     and l.merged_into_lead_id is null
    left join public.ambassadors a on a.id = l.ambassador_id
    left join public.users u on u.id = a.user_id
    order by s.id, coalesce(l.approved_as_lead, false) desc, l.created_at asc nulls last
  ),
  explained as (
    select
      c.*,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'field', replace(sig_a.signal_type, '_', ' '),
              'value', sig_a.signal_value,
              'strength', case
                when sig_a.signal_type in ('phone', 'email') then 'very strong'
                when sig_a.signal_type = 'visitor_id' then 'strong'
                when sig_a.signal_type = 'device_signature' then 'medium'
                else 'weak'
              end
            )
            order by case sig_a.signal_type
              when 'phone' then 1
              when 'email' then 2
              when 'visitor_id' then 3
              when 'device_signature' then 4
              when 'ip_signature' then 5
              else 6
            end
          )
          from public.identity_signals sig_a
          join public.identity_signals sig_b
            on sig_b.signal_type = sig_a.signal_type
           and sig_b.signal_value = sig_a.signal_value
           and sig_b.identity_id = c.other_identity_id
          where sig_a.identity_id = v_lead.identity_id
        ),
        '[]'::jsonb
      ) as calculated_same_fields,
      jsonb_strip_nulls(jsonb_build_array(
        case
          when nullif(lower(trim(coalesce(v_lead.customer_name, ''))), '') is distinct from
               nullif(lower(trim(coalesce(c.customer_name, c.primary_name, ''))), '')
          then jsonb_build_object(
            'field', 'name',
            'current', v_lead.customer_name,
            'candidate', coalesce(c.customer_name, c.primary_name)
          )
        end,
        case
          when public.normalize_contact_phone(v_lead.customer_phone) is distinct from
               public.normalize_contact_phone(coalesce(c.customer_phone, c.primary_phone))
          then jsonb_build_object(
            'field', 'phone',
            'current', public.normalize_contact_phone(v_lead.customer_phone),
            'candidate', public.normalize_contact_phone(coalesce(c.customer_phone, c.primary_phone))
          )
        end,
        case
          when nullif(lower(trim(coalesce(v_lead.customer_email, ''))), '') is distinct from
               nullif(lower(trim(coalesce(c.customer_email, c.primary_email, ''))), '')
          then jsonb_build_object(
            'field', 'email',
            'current', v_lead.customer_email,
            'candidate', coalesce(c.customer_email, c.primary_email)
          )
        end,
        case
          when v_lead.ambassador_id is distinct from c.ambassador_id
          then jsonb_build_object(
            'field', 'ambassador',
            'current', v_lead.ambassador_id,
            'candidate', c.ambassador_id
          )
        end
      )) as calculated_different_fields
    from candidates c
  )
  select
    e.suggestion_id,
    e.candidate_lead_id,
    coalesce(e.customer_name, e.primary_name, 'Unnamed lead') as candidate_name,
    coalesce(e.customer_phone, e.primary_phone) as candidate_phone,
    coalesce(e.customer_email, e.primary_email) as candidate_email,
    coalesce(e.display_name, e.ambassador_user_name, e.ambassador_tag, 'No Ambassador') as candidate_ambassador,
    coalesce(e.confidence, 0) as confidence,
    case
      when coalesce(e.confidence, 0) >= 90 then
        'Strong suggestion because the records share verified or persistent identity signals.'
      when coalesce(e.confidence, 0) >= 70 then
        'Review required because several signals match, but important differences remain.'
      else
        'Weak suggestion. Do not merge without direct customer confirmation.'
    end as reason_summary,
    e.calculated_same_fields as same_fields,
    e.calculated_different_fields as different_fields,
    case
      when coalesce(e.approved_as_lead, false)
           and (
             not coalesce(v_lead.approved_as_lead, false)
             or coalesce(e.candidate_approved_at, e.created_at)
                < coalesce(v_lead.approved_at, v_lead.created_at)
           )
      then 'This candidate was credited first. Open the candidate and keep it as the primary lead before merging.'
      when coalesce(e.confidence, 0) >= 90 then 'Review and merge if the displayed differences are explainable.'
      when coalesce(e.confidence, 0) >= 70 then 'Confirm the customer before merging.'
      else 'Keep separate unless new evidence becomes available.'
    end as recommendation,
    jsonb_build_object(
      'primary_lead_id', p_lead_id,
      'candidate_lead_id', e.candidate_lead_id,
      'primary_ambassador_id', v_lead.ambassador_id,
      'candidate_ambassador_id', e.ambassador_id,
      'will_keep_primary_lead', true,
      'will_preserve_timeline', true,
      'will_award_extra_lead_points', false,
      'will_archive_duplicate_lead', e.candidate_lead_id is not null,
      'merge_allowed_from_this_page', not (
        coalesce(e.approved_as_lead, false)
        and (
          not coalesce(v_lead.approved_as_lead, false)
          or coalesce(e.candidate_approved_at, e.created_at)
             < coalesce(v_lead.approved_at, v_lead.created_at)
        )
      ),
      'ownership_warning', case
        when coalesce(e.approved_as_lead, false)
             and (
               not coalesce(v_lead.approved_as_lead, false)
               or coalesce(e.candidate_approved_at, e.created_at)
                  < coalesce(v_lead.approved_at, v_lead.created_at)
             )
        then 'The candidate was credited first and must remain the primary lead. Open that lead to merge safely.'
        when v_lead.ambassador_id is distinct from e.ambassador_id
        then 'The candidate belongs to a different Ambassador. First valid attribution must be reviewed carefully.'
        else null
      end
    ) as impact_summary,
    e.created_at
  from explained e
  order by e.confidence desc, e.created_at desc;
end;
$$;

create or replace function public.reverse_merged_lead_credit_v3(
  p_admin_id uuid,
  p_duplicate_lead_id uuid,
  p_primary_lead_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_amount integer := 0;
begin
  if auth.uid() is distinct from p_admin_id
     or not exists (
       select 1
       from public.users u
       where u.id = p_admin_id
         and u.role = 'admin'
     ) then
    raise exception 'Only the signed-in Admin can reverse duplicate lead credit';
  end if;

  select *
  into v_lead
  from public.leads
  where id = p_duplicate_lead_id
  for update;

  if not found or not coalesce(v_lead.approved_as_lead, false) then
    return 0;
  end if;

  if exists (
    select 1
    from public.point_transactions pt
    where pt.reference_id = p_duplicate_lead_id
      and pt.reference_type = 'lead_merge_reversal'
  ) then
    return 0;
  end if;

  select coalesce(sum(greatest(pt.amount, 0)), 0)::integer
  into v_amount
  from public.point_transactions pt
  where pt.ambassador_id = v_lead.ambassador_id
    and pt.type = 'lead'
    and pt.reference_id = p_duplicate_lead_id
    and pt.reference_type in ('lead', 'leads');

  update public.ambassadors
  set
    total_leads = greatest(coalesce(total_leads, 0) - 1, 0),
    total_points = greatest(coalesce(total_points, 0) - v_amount, 0)
  where id = v_lead.ambassador_id;

  if v_amount > 0 then
    insert into public.point_transactions (
      ambassador_id,
      amount,
      type,
      reference_id,
      reference_type,
      reason,
      created_at
    )
    values (
      v_lead.ambassador_id,
      -v_amount,
      'lead',
      p_duplicate_lead_id,
      'lead_merge_reversal',
      'Duplicate lead credit reversed during merge into lead ' || p_primary_lead_id::text,
      now()
    );
  end if;

  return v_amount;
end;
$$;

create or replace function public.resolve_explained_merge_v3(
  p_admin_id uuid,
  p_suggestion_id uuid,
  p_primary_lead_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_suggestion public.identity_match_suggestions%rowtype;
  v_primary public.leads%rowtype;
  v_primary_identity uuid;
  v_duplicate_identity uuid;
  v_duplicate_lead_ids uuid[] := '{}';
  v_duplicate_lead_id uuid;
  v_first_credited_lead_id uuid;
  v_reversed_points integer := 0;
begin
  if auth.uid() is distinct from p_admin_id
     or not exists (
       select 1
       from public.users u
       where u.id = p_admin_id
         and u.role = 'admin'
     ) then
    raise exception 'Only the signed-in Admin can resolve merge suggestions';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'A written reason is required for every merge decision';
  end if;

  select *
  into v_suggestion
  from public.identity_match_suggestions
  where id = p_suggestion_id
    and decision = 'pending'
  for update;

  if not found then
    raise exception 'Suggestion not found or already reviewed';
  end if;

  select *
  into v_primary
  from public.leads
  where id = p_primary_lead_id
    and merged_into_lead_id is null
  for update;

  if not found or v_primary.identity_id is null then
    raise exception 'Primary lead or identity was not found';
  end if;

  if v_primary.identity_id = v_suggestion.identity_a then
    v_primary_identity := v_suggestion.identity_a;
    v_duplicate_identity := v_suggestion.identity_b;
  elsif v_primary.identity_id = v_suggestion.identity_b then
    v_primary_identity := v_suggestion.identity_b;
    v_duplicate_identity := v_suggestion.identity_a;
  else
    raise exception 'Primary lead is not part of this suggestion';
  end if;

  if p_action = 'keep_separate' then
    perform public.keep_identities_separate(
      p_admin_id,
      p_suggestion_id,
      p_note
    );

    update public.identity_match_suggestions
    set resolution_note = p_note
    where id = p_suggestion_id;

    return jsonb_build_object('ok', true, 'action', 'keep_separate');
  end if;

  if p_action = 'attach_activity_only' then
    update public.identity_match_suggestions
    set
      decision = 'activity_only',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      resolution_note = p_note
    where id = p_suggestion_id;

    insert into public.lead_events (
      lead_id,
      ambassador_id,
      event_type,
      event_title,
      event_description,
      event_data,
      created_by,
      created_at
    )
    values (
      p_primary_lead_id,
      v_primary.ambassador_id,
      'possible_identity_activity_attached',
      'Possible related activity attached',
      'Admin kept the identities separate but attached a reference to the possible related activity.',
      jsonb_build_object(
        'suggestion_id', p_suggestion_id,
        'other_identity_id', v_duplicate_identity,
        'reason', p_note
      ),
      p_admin_id,
      now()
    );

    return jsonb_build_object('ok', true, 'action', 'attach_activity_only');
  end if;

  if p_action <> 'merge' then
    raise exception 'Unsupported merge action';
  end if;

  -- Preserve first valid attribution. A later or uncredited record cannot be
  -- selected as primary when another lead was already credited first.
  select l.id
  into v_first_credited_lead_id
  from public.leads l
  where l.identity_id in (v_primary_identity, v_duplicate_identity)
    and l.merged_into_lead_id is null
    and coalesce(l.approved_as_lead, false)
  order by coalesce(l.approved_at, l.created_at) asc, l.created_at asc
  limit 1;

  if v_first_credited_lead_id is not null
     and v_first_credited_lead_id <> p_primary_lead_id then
    raise exception 'The earliest credited lead must remain primary. Open lead % and merge from that record.',
      v_first_credited_lead_id;
  end if;

  select coalesce(array_agg(l.id), '{}')
  into v_duplicate_lead_ids
  from public.leads l
  where l.identity_id = v_duplicate_identity
    and l.id <> p_primary_lead_id
    and l.merged_into_lead_id is null;

  perform public.merge_identities(
    p_admin_id,
    v_primary_identity,
    v_duplicate_identity,
    coalesce(p_note, 'Approved from explained merge review')
  );

  foreach v_duplicate_lead_id in array v_duplicate_lead_ids
  loop
    v_reversed_points := v_reversed_points + public.reverse_merged_lead_credit_v3(
      p_admin_id,
      v_duplicate_lead_id,
      p_primary_lead_id
    );

    update public.leads
    set
      merged_into_lead_id = p_primary_lead_id,
      duplicate_status = 'merged',
      lead_intelligence_status = 'merged',
      needs_merge_review = false,
      approved_as_lead = false,
      lead_approval_status = 'merged',
      updated_at = now()
    where id = v_duplicate_lead_id;

    update public.referral_clicks
    set
      lead_id = p_primary_lead_id,
      counted_as_lead = false,
      match_reason = 'duplicate_lead_merged_into_primary'
    where lead_id = v_duplicate_lead_id;

    update public.ambassador_spin_attributions
    set
      lead_id = p_primary_lead_id,
      credited_as_lead = false,
      qualification_status = 'existing_lead',
      updated_at = now()
    where lead_id = v_duplicate_lead_id;

    update public.website_events
    set lead_id = p_primary_lead_id
    where lead_id = v_duplicate_lead_id;
  end loop;

  update public.identity_match_suggestions
  set resolution_note = p_note
  where id = p_suggestion_id;

  insert into public.lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by,
    created_at
  )
  values (
    p_primary_lead_id,
    v_primary.ambassador_id,
    'duplicate_identity_merged',
    'Duplicate customer record merged',
    'Admin merged a duplicate identity into this lead after reviewing the matching and differing evidence.',
    jsonb_build_object(
      'suggestion_id', p_suggestion_id,
      'duplicate_identity_id', v_duplicate_identity,
      'duplicate_lead_ids', to_jsonb(v_duplicate_lead_ids),
      'reversed_points', v_reversed_points,
      'reason', p_note
    ),
    p_admin_id,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'merge',
    'primary_lead_id', p_primary_lead_id,
    'merged_lead_ids', to_jsonb(v_duplicate_lead_ids),
    'reversed_points', v_reversed_points
  );
end;
$$;

create or replace function public.get_recent_whatsapp_clicks_v3(p_limit integer default 40)
returns table (
  referral_click_id uuid,
  clicked_at timestamptz,
  visitor_id text,
  ambassador_id uuid,
  ambassador_name text,
  lead_id uuid,
  lead_name text,
  lead_phone text,
  source_page text,
  product_id uuid,
  search_query text,
  needs_number boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ) then
    raise exception 'Only admins can view WhatsApp intake';
  end if;

  return query
  select
    rc.id,
    rc.created_at,
    rc.visitor_id,
    rc.ambassador_id,
    coalesce(a.display_name, u.name, a.ambassador_tag, 'Unknown Ambassador'),
    rc.lead_id,
    l.customer_name,
    coalesce(
      public.normalize_contact_phone(l.customer_phone),
      public.normalize_contact_phone(i.primary_phone)
    ),
    rc.context ->> 'source_page',
    nullif(rc.context ->> 'product_id', '')::uuid,
    rc.context ->> 'search_query',
    coalesce(
      public.normalize_contact_phone(l.customer_phone),
      public.normalize_contact_phone(i.primary_phone)
    ) is null
  from public.referral_clicks rc
  left join public.ambassadors a on a.id = rc.ambassador_id
  left join public.users u on u.id = a.user_id
  left join public.leads l on l.id = rc.lead_id
  left join public.identities i on i.id = l.identity_id
  where rc.source = 'whatsapp'
    and not exists (
      select 1
      from public.whatsapp_intake_audit wia
      where wia.referral_click_id = rc.id
    )
  order by
    (
      coalesce(
        public.normalize_contact_phone(l.customer_phone),
        public.normalize_contact_phone(i.primary_phone)
      ) is null
    ) desc,
    rc.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;

create or replace function public.get_whatsapp_match_suggestions_v3(
  p_referral_click_id uuid,
  p_phone text default null
)
returns table (
  lead_id uuid,
  identity_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  ambassador_name text,
  score integer,
  confidence_label text,
  reason_summary text,
  same_fields jsonb,
  different_fields jsonb,
  recommendation text,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_click public.referral_clicks%rowtype;
  v_phone text := public.normalize_contact_phone(p_phone);
  v_ip_signature text;
  v_device_signature text;
begin
  if not exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ) then
    raise exception 'Only admins can search WhatsApp matches';
  end if;

  select *
  into v_click
  from public.referral_clicks
  where id = p_referral_click_id
    and source = 'whatsapp';

  if not found then
    raise exception 'WhatsApp click not found';
  end if;

  v_ip_signature := coalesce(
    nullif(v_click.context ->> 'ip_signature', ''),
    case
      when nullif(trim(coalesce(v_click.ip_address, '')), '') is null then null
      else md5(trim(v_click.ip_address))
    end
  );
  v_device_signature := coalesce(
    nullif(v_click.context ->> 'device_signature', ''),
    case
      when nullif(trim(coalesce(v_click.user_agent, '')), '') is null then null
      else md5(trim(v_click.user_agent))
    end
  );

  return query
  with candidate_base as (
    select
      l.*,
      i.primary_phone,
      coalesce(a.display_name, u.name, a.ambassador_tag, 'No Ambassador') as candidate_ambassador_name,
      greatest(coalesce(l.last_clicked_at, l.updated_at, l.created_at), l.created_at) as last_activity,
      coalesce(
        public.normalize_contact_phone(l.customer_phone),
        public.normalize_contact_phone(i.primary_phone)
      ) as normalized_candidate_phone,
      (
        case when v_phone is not null and coalesce(
          public.normalize_contact_phone(l.customer_phone),
          public.normalize_contact_phone(i.primary_phone)
        ) = v_phone then 100 else 0 end +
        case when v_click.identity_id is not null and l.identity_id = v_click.identity_id then 95 else 0 end +
        case when l.visitor_id = v_click.visitor_id
                  or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_click.visitor_id)
             then 85 else 0 end +
        case when v_device_signature is not null and (
                  l.device_signature = v_device_signature
                  or coalesce(l.device_signatures, '[]'::jsonb) @> jsonb_build_array(v_device_signature)
             ) then 35 else 0 end +
        case when v_ip_signature is not null and (
                  l.ip_signature = v_ip_signature
                  or coalesce(l.ip_signatures, '[]'::jsonb) @> jsonb_build_array(v_ip_signature)
             ) then 20 else 0 end +
        case when l.ambassador_id = v_click.ambassador_id then 10 else 0 end +
        case when nullif(v_click.context ->> 'product_id', '') is not null
                  and (
                    l.product_id::text = v_click.context ->> 'product_id'
                    or l.source_detail ->> 'product_id' = v_click.context ->> 'product_id'
                  )
             then 15 else 0 end +
        case when nullif(lower(trim(v_click.context ->> 'search_query')), '') is not null
                  and lower(trim(coalesce(l.source_detail ->> 'search_query', '')))
                    = lower(trim(v_click.context ->> 'search_query'))
             then 10 else 0 end +
        case
          when abs(extract(epoch from (coalesce(l.last_clicked_at, l.created_at) - v_click.created_at))) <= 900 then 10
          when abs(extract(epoch from (coalesce(l.last_clicked_at, l.created_at) - v_click.created_at))) <= 86400 then 5
          else 0
        end
      )::integer as calculated_score
    from public.leads l
    left join public.identities i on i.id = l.identity_id
    left join public.ambassadors a on a.id = l.ambassador_id
    left join public.users u on u.id = a.user_id
    where l.merged_into_lead_id is null
      and (v_click.lead_id is null or l.id <> v_click.lead_id)
      and (
        v_phone is not null
        or l.ambassador_id = v_click.ambassador_id
        or l.identity_id = v_click.identity_id
        or l.visitor_id = v_click.visitor_id
        or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_click.visitor_id)
        or l.created_at >= v_click.created_at - interval '30 days'
      )
  ),
  ranked as (
    select *
    from candidate_base
    where calculated_score > 0
    order by calculated_score desc, last_activity desc
    limit 8
  )
  select
    r.id,
    r.identity_id,
    coalesce(r.customer_name, 'Unnamed lead'),
    r.normalized_candidate_phone,
    r.customer_email,
    r.candidate_ambassador_name,
    least(r.calculated_score, 100),
    case
      when v_phone is not null and r.normalized_candidate_phone = v_phone then 'Very strong'
      when r.calculated_score >= 90 then 'Strong'
      when r.calculated_score >= 50 then 'Medium'
      else 'Weak'
    end,
    case
      when v_phone is not null and r.normalized_candidate_phone = v_phone then
        'Exact normalized phone number match.'
      when v_click.identity_id is not null and r.identity_id = v_click.identity_id then
        'The WhatsApp click and this lead share the same identity.'
      when r.visitor_id = v_click.visitor_id
           or coalesce(r.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_click.visitor_id) then
        'The WhatsApp click and this lead share the same browser visitor ID.'
      when r.calculated_score >= 50 then
        'Several contextual signals match. Admin confirmation is required.'
      else
        'Only weak contextual signals match. IP address alone must never cause a merge.'
    end,
    jsonb_strip_nulls(jsonb_build_array(
      case when v_phone is not null and r.normalized_candidate_phone = v_phone
        then jsonb_build_object('field', 'phone', 'value', v_phone, 'strength', 'very strong') end,
      case when v_click.identity_id is not null and r.identity_id = v_click.identity_id
        then jsonb_build_object('field', 'identity', 'value', r.identity_id, 'strength', 'very strong') end,
      case when r.visitor_id = v_click.visitor_id
             or coalesce(r.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_click.visitor_id)
        then jsonb_build_object('field', 'visitor ID', 'value', v_click.visitor_id, 'strength', 'strong') end,
      case when v_device_signature is not null and (
             r.device_signature = v_device_signature
             or coalesce(r.device_signatures, '[]'::jsonb) @> jsonb_build_array(v_device_signature)
        ) then jsonb_build_object('field', 'device', 'value', 'same device signature', 'strength', 'medium') end,
      case when v_ip_signature is not null and (
             r.ip_signature = v_ip_signature
             or coalesce(r.ip_signatures, '[]'::jsonb) @> jsonb_build_array(v_ip_signature)
        ) then jsonb_build_object('field', 'IP', 'value', 'same IP signature', 'strength', 'weak') end,
      case when r.ambassador_id = v_click.ambassador_id
        then jsonb_build_object('field', 'Ambassador', 'value', r.candidate_ambassador_name, 'strength', 'supporting') end,
      case when nullif(v_click.context ->> 'product_id', '') is not null
                  and (
                    r.product_id::text = v_click.context ->> 'product_id'
                    or r.source_detail ->> 'product_id' = v_click.context ->> 'product_id'
                  )
        then jsonb_build_object('field', 'product', 'value', v_click.context ->> 'product_id', 'strength', 'supporting') end,
      case when nullif(lower(trim(v_click.context ->> 'search_query')), '') is not null
                  and lower(trim(coalesce(r.source_detail ->> 'search_query', '')))
                    = lower(trim(v_click.context ->> 'search_query'))
        then jsonb_build_object('field', 'search', 'value', v_click.context ->> 'search_query', 'strength', 'supporting') end,
      case
        when abs(extract(epoch from (coalesce(r.last_clicked_at, r.created_at) - v_click.created_at))) <= 900
        then jsonb_build_object('field', 'timing', 'value', 'activity occurred within 15 minutes', 'strength', 'supporting')
        when abs(extract(epoch from (coalesce(r.last_clicked_at, r.created_at) - v_click.created_at))) <= 86400
        then jsonb_build_object('field', 'timing', 'value', 'activity occurred within 24 hours', 'strength', 'weak')
      end
    )),
    jsonb_strip_nulls(jsonb_build_array(
      case when v_phone is not null and r.normalized_candidate_phone is distinct from v_phone
        then jsonb_build_object('field', 'phone', 'entered', v_phone, 'candidate', r.normalized_candidate_phone) end,
      case when r.ambassador_id is distinct from v_click.ambassador_id
        then jsonb_build_object('field', 'Ambassador', 'clicked', v_click.ambassador_id, 'candidate', r.ambassador_id) end,
      case when v_click.identity_id is not null and r.identity_id is distinct from v_click.identity_id
        then jsonb_build_object('field', 'identity', 'clicked', v_click.identity_id, 'candidate', r.identity_id) end,
      case when v_device_signature is not null
                  and r.device_signature is not null
                  and r.device_signature is distinct from v_device_signature
        then jsonb_build_object('field', 'device', 'clicked', 'WhatsApp click device', 'candidate', 'different saved device') end,
      case when v_ip_signature is not null
                  and r.ip_signature is not null
                  and r.ip_signature is distinct from v_ip_signature
        then jsonb_build_object('field', 'IP', 'clicked', 'WhatsApp click IP signature', 'candidate', 'different saved IP signature') end,
      case when nullif(v_click.context ->> 'product_id', '') is not null
                  and r.product_id is not null
                  and r.product_id::text is distinct from v_click.context ->> 'product_id'
        then jsonb_build_object('field', 'product', 'clicked', v_click.context ->> 'product_id', 'candidate', r.product_id) end
    )),
    case
      when v_phone is not null and r.normalized_candidate_phone = v_phone then
        'Attach the WhatsApp activity to this existing lead. Do not create another lead or award more points.'
      when r.calculated_score >= 90 then
        'Review the differences, then attach to the existing lead if they are explainable.'
      when r.calculated_score >= 50 then
        'Ask the customer to confirm their identity before attaching.'
      else
        'Keep separate unless stronger evidence is provided.'
    end,
    r.last_activity
  from ranked r;
end;
$$;

create or replace function public.resolve_whatsapp_intake_v3(
  p_admin_id uuid,
  p_referral_click_id uuid,
  p_phone text,
  p_action text,
  p_target_lead_id uuid default null,
  p_reason text default null,
  p_match_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_click public.referral_clicks%rowtype;
  v_source public.leads%rowtype;
  v_target public.leads%rowtype;
  v_phone text := public.normalize_contact_phone(p_phone);
  v_existing_phone_lead uuid;
  v_new_credit boolean := false;
  v_target_identity uuid;
  v_visitor_ids jsonb;
  v_duplicate_lead_ids uuid[] := '{}';
  v_duplicate_lead_id uuid;
  v_first_credited_lead_id uuid;
  v_reversed_points integer := 0;
begin
  if auth.uid() is distinct from p_admin_id
     or not exists (
       select 1
       from public.users u
       where u.id = p_admin_id
         and u.role = 'admin'
     ) then
    raise exception 'Only the signed-in Admin can resolve WhatsApp intake';
  end if;

  if v_phone is null then
    raise exception 'Enter a valid phone number';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A written reason is required for every WhatsApp identity decision';
  end if;

  select *
  into v_click
  from public.referral_clicks
  where id = p_referral_click_id
    and source = 'whatsapp'
  for update;

  if not found then
    raise exception 'WhatsApp click not found';
  end if;

  if exists (
    select 1
    from public.whatsapp_intake_audit wia
    where wia.referral_click_id = v_click.id
  ) then
    raise exception 'This WhatsApp click has already been resolved';
  end if;

  if v_click.lead_id is not null then
    select *
    into v_source
    from public.leads
    where id = v_click.lead_id
    for update;
  end if;

  select l.id
  into v_existing_phone_lead
  from public.leads l
  left join public.identities i on i.id = l.identity_id
  where l.merged_into_lead_id is null
    and coalesce(
      public.normalize_contact_phone(l.customer_phone),
      public.normalize_contact_phone(i.primary_phone)
    ) = v_phone
  order by
    coalesce(l.approved_as_lead, false) desc,
    l.created_at asc
  limit 1;

  if p_action = 'attach_existing' then
    if p_target_lead_id is null then
      raise exception 'Choose the existing lead to attach';
    end if;

    select *
    into v_target
    from public.leads
    where id = p_target_lead_id
      and merged_into_lead_id is null
    for update;

    if not found then
      raise exception 'Target lead not found';
    end if;

    if v_existing_phone_lead is not null
       and v_existing_phone_lead <> v_target.id
       and (v_source.id is null or v_existing_phone_lead <> v_source.id) then
      raise exception 'The entered phone already belongs to another active lead';
    end if;

    v_target_identity := coalesce(v_target.identity_id, v_click.identity_id);

    if v_target_identity is null then
      v_target_identity := public.upsert_identity_from_signals(
        jsonb_build_array(
          jsonb_build_object('type', 'phone', 'value', v_phone)
        ),
        nullif(trim(coalesce(v_target.customer_name, '')), ''),
        v_phone,
        nullif(lower(trim(coalesce(v_target.customer_email, ''))), ''),
        'whatsapp_manual_confirmation'
      );
    end if;

    select l.id
    into v_first_credited_lead_id
    from public.leads l
    where l.merged_into_lead_id is null
      and coalesce(l.approved_as_lead, false)
      and (
        l.id = v_target.id
        or (v_source.identity_id is not null and l.identity_id = v_source.identity_id)
        or (v_target_identity is not null and l.identity_id = v_target_identity)
      )
    order by coalesce(l.approved_at, l.created_at) asc, l.created_at asc
    limit 1;

    if v_first_credited_lead_id is not null
       and v_first_credited_lead_id <> v_target.id then
      raise exception 'The earliest credited lead % must remain primary. Attach the WhatsApp activity to that lead instead.',
        v_first_credited_lead_id;
    end if;

    select coalesce(array_agg(l.id), '{}')
    into v_duplicate_lead_ids
    from public.leads l
    where l.merged_into_lead_id is null
      and l.id <> v_target.id
      and (
        (v_source.id is not null and l.id = v_source.id)
        or (v_source.identity_id is not null and l.identity_id = v_source.identity_id)
        or (v_target_identity is not null and l.identity_id = v_target_identity)
      );
    v_visitor_ids := coalesce(v_target.visitor_ids, '[]'::jsonb);
    if v_click.visitor_id is not null
       and not (v_visitor_ids @> jsonb_build_array(v_click.visitor_id)) then
      v_visitor_ids := v_visitor_ids || jsonb_build_array(v_click.visitor_id);
    end if;

    update public.leads
    set
      identity_id = coalesce(identity_id, v_target_identity),
      customer_phone = case
        when public.normalize_contact_phone(customer_phone) is null then v_phone
        else customer_phone
      end,
      visitor_id = coalesce(visitor_id, v_click.visitor_id),
      visitor_ids = v_visitor_ids,
      source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object(
        'whatsapp_confirmed', true,
        'whatsapp_referral_click_id', v_click.id
      ),
      updated_at = now()
    where id = v_target.id
    returning * into v_target;

    if v_source.identity_id is not null
       and v_target.identity_id is not null
       and v_source.identity_id <> v_target.identity_id then
      perform public.merge_identities(
        p_admin_id,
        v_target.identity_id,
        v_source.identity_id,
        p_reason
      );
    end if;

    foreach v_duplicate_lead_id in array v_duplicate_lead_ids
    loop
      v_reversed_points := v_reversed_points + public.reverse_merged_lead_credit_v3(
        p_admin_id,
        v_duplicate_lead_id,
        v_target.id
      );

      update public.leads
      set
        merged_into_lead_id = v_target.id,
        duplicate_status = 'merged',
        lead_intelligence_status = 'merged',
        needs_merge_review = false,
        approved_as_lead = false,
        lead_approval_status = 'merged',
        updated_at = now()
      where id = v_duplicate_lead_id;

      update public.referral_clicks
      set
        lead_id = v_target.id,
        counted_as_lead = false,
        match_reason = 'duplicate_lead_merged_into_primary'
      where lead_id = v_duplicate_lead_id;

      update public.ambassador_spin_attributions
      set
        lead_id = v_target.id,
        credited_as_lead = false,
        qualification_status = 'existing_lead',
        updated_at = now()
      where lead_id = v_duplicate_lead_id;

      update public.website_events
      set lead_id = v_target.id
      where lead_id = v_duplicate_lead_id;
    end loop;

    update public.referral_clicks
    set
      lead_id = v_target.id,
      identity_id = v_target.identity_id,
      counted_as_lead = false,
      match_score = 100,
      match_reason = 'whatsapp_number_attached_to_existing_lead'
    where id = v_click.id;

    perform public.attach_visitor_history_to_lead_v3(
      v_click.visitor_id,
      v_target.identity_id,
      v_target.id
    );

  elsif p_action in ('create_new', 'keep_separate') then
    if v_existing_phone_lead is not null
       and (v_source.id is null or v_existing_phone_lead <> v_source.id) then
      raise exception 'This phone already belongs to an existing lead. Attach it instead of creating a duplicate.';
    end if;

    if v_source.id is null then
      insert into public.leads (
        ambassador_id,
        identity_id,
        source,
        source_detail,
        customer_name,
        customer_phone,
        referral_code_used,
        status,
        funnel_stage,
        lead_approval_status,
        approved_as_lead,
        approved_at,
        approved_by,
        visitor_id,
        visitor_ids,
        click_count,
        last_clicked_at,
        duplicate_status,
        confidence_score,
        lead_intelligence_status,
        needs_merge_review,
        created_at,
        updated_at
      )
      values (
        v_click.ambassador_id,
        v_click.identity_id,
        'whatsapp',
        jsonb_build_object(
          'channel', 'whatsapp',
          'confirmed_by_admin', true,
          'referral_click_id', v_click.id
        ),
        'WhatsApp Lead',
        v_phone,
        v_click.referral_code,
        'new',
        'new_lead',
        'approved',
        true,
        now(),
        p_admin_id,
        v_click.visitor_id,
        case when v_click.visitor_id is null then '[]'::jsonb else jsonb_build_array(v_click.visitor_id) end,
        1,
        v_click.created_at,
        'unique',
        100,
        'identity_linked',
        false,
        now(),
        now()
      )
      returning * into v_source;

      v_new_credit := true;
    else
      v_new_credit := not coalesce(v_source.approved_as_lead, false);

      update public.leads
      set
        customer_phone = v_phone,
        lead_approval_status = 'approved',
        approved_as_lead = true,
        approved_at = coalesce(approved_at, now()),
        approved_by = coalesce(approved_by, p_admin_id),
        source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object(
          'whatsapp_confirmed', true,
          'whatsapp_referral_click_id', v_click.id
        ),
        updated_at = now()
      where id = v_source.id
      returning * into v_source;
    end if;

    if v_new_credit then
      update public.ambassadors
      set total_leads = coalesce(total_leads, 0) + 1
      where id = v_source.ambassador_id;

      if not exists (
        select 1
        from public.point_transactions pt
        where pt.ambassador_id = v_source.ambassador_id
          and pt.type = 'lead'
          and pt.reference_id = v_source.id
          and pt.reference_type in ('lead', 'leads')
      ) then
        perform public.award_points(
          v_source.ambassador_id,
          100,
          'lead',
          v_source.id,
          'leads',
          'Confirmed WhatsApp referral lead'
        );
      end if;
    end if;

    update public.referral_clicks
    set
      lead_id = v_source.id,
      identity_id = v_source.identity_id,
      counted_as_lead = v_new_credit,
      match_score = 100,
      match_reason = case
        when p_action = 'keep_separate' then 'admin_confirmed_keep_separate'
        else 'admin_confirmed_new_whatsapp_lead'
      end
    where id = v_click.id;

    perform public.attach_visitor_history_to_lead_v3(
      v_click.visitor_id,
      v_source.identity_id,
      v_source.id
    );

    v_target := v_source;

  elsif p_action = 'attach_activity_only' then
    if p_target_lead_id is null then
      raise exception 'Choose a lead for activity-only attachment';
    end if;

    select *
    into v_target
    from public.leads
    where id = p_target_lead_id
      and merged_into_lead_id is null;

    if not found then
      raise exception 'Target lead not found';
    end if;

    update public.referral_clicks
    set
      lead_id = v_target.id,
      counted_as_lead = false,
      match_reason = 'whatsapp_activity_only_attachment'
    where id = v_click.id;

  else
    raise exception 'Unsupported WhatsApp intake action';
  end if;

  if p_action <> 'attach_activity_only' and v_target.identity_id is not null then
    update public.identities
    set
      primary_phone = coalesce(primary_phone, v_phone),
      updated_at = now()
    where id = v_target.identity_id;

    insert into public.identity_signals (
      identity_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified,
      source
    )
    values (
      v_target.identity_id,
      'phone',
      v_phone,
      100,
      true,
      'whatsapp_manual_confirmation'
    )
    on conflict (identity_id, signal_type, signal_value)
    do update set
      verified = true,
      last_seen_at = now(),
      seen_count = public.identity_signals.seen_count + 1;
  end if;

  insert into public.lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by,
    created_at
  )
  values (
    v_target.id,
    v_target.ambassador_id,
    'whatsapp_number_reviewed',
    'WhatsApp number reviewed',
    case p_action
      when 'attach_existing' then 'The WhatsApp number and activity were attached to an existing lead.'
      when 'attach_activity_only' then 'Only the WhatsApp activity was attached; the identities remain separate.'
      when 'keep_separate' then 'Admin confirmed this person should remain a separate lead.'
      else 'Admin confirmed a new WhatsApp lead.'
    end,
    jsonb_build_object(
      'referral_click_id', v_click.id,
      'entered_phone', v_phone,
      'action', p_action,
      'source_lead_id', v_source.id,
      'target_lead_id', v_target.id,
      'reason', p_reason,
      'reversed_points', v_reversed_points
    ),
    p_admin_id,
    now()
  );

  insert into public.whatsapp_intake_audit (
    referral_click_id,
    entered_phone,
    normalized_phone,
    action,
    source_lead_id,
    target_lead_id,
    reason,
    match_snapshot,
    created_by,
    created_at
  )
  values (
    v_click.id,
    p_phone,
    v_phone,
    p_action,
    v_source.id,
    v_target.id,
    p_reason,
    coalesce(p_match_snapshot, '{}'::jsonb),
    p_admin_id,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'lead_id', v_target.id,
    'new_lead_credit', v_new_credit,
    'points_awarded', case when v_new_credit then 100 else 0 end,
    'reversed_points', v_reversed_points
  );
end;
$$;

-- Extend Spin Wheel qualification so anonymous website activity follows the
-- identified lead after registration. The existing qualification function
-- still owns all duplicate, first-touch and points rules.
create or replace function public.qualify_ambassador_spin_lead_v3(
  p_visitor_id text,
  p_referral_code text,
  p_identity_id uuid,
  p_spin_player_id uuid,
  p_full_name text,
  p_phone text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_lead_id uuid;
begin
  v_result := public.qualify_ambassador_spin_lead(
    p_visitor_id,
    p_referral_code,
    p_identity_id,
    p_spin_player_id,
    p_full_name,
    p_phone,
    p_email
  );

  v_lead_id := nullif(v_result ->> 'lead_id', '')::uuid;

  if coalesce((v_result ->> 'ok')::boolean, false)
     and v_lead_id is not null then
    perform public.attach_visitor_history_to_lead_v3(
      p_visitor_id,
      p_identity_id,
      v_lead_id
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.track_website_event_v3(text, text, text, text, integer, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.track_website_event_v3(text, text, text, text, integer, uuid, text, text, text, jsonb)
  to service_role;

revoke all on function public.track_whatsapp_referral_click_v3(text, text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.track_whatsapp_referral_click_v3(text, text, text, text, text, uuid, text)
  to service_role;

revoke all on function public.attach_visitor_history_to_lead_v3(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.attach_visitor_history_to_lead_v3(text, uuid, uuid)
  to service_role;

revoke all on function public.get_unified_lead_timeline_v3(uuid)
  from public, anon;
grant execute on function public.get_unified_lead_timeline_v3(uuid)
  to authenticated, service_role;

revoke all on function public.get_explained_merge_suggestions_v3(uuid)
  from public, anon;
grant execute on function public.get_explained_merge_suggestions_v3(uuid)
  to authenticated, service_role;

revoke all on function public.reverse_merged_lead_credit_v3(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.resolve_explained_merge_v3(uuid, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.resolve_explained_merge_v3(uuid, uuid, uuid, text, text)
  to authenticated, service_role;

revoke all on function public.get_recent_whatsapp_clicks_v3(integer)
  from public, anon;
grant execute on function public.get_recent_whatsapp_clicks_v3(integer)
  to authenticated, service_role;

revoke all on function public.get_whatsapp_match_suggestions_v3(uuid, text)
  from public, anon;
grant execute on function public.get_whatsapp_match_suggestions_v3(uuid, text)
  to authenticated, service_role;

revoke all on function public.resolve_whatsapp_intake_v3(uuid, uuid, text, text, uuid, text, jsonb)
  from public, anon;
grant execute on function public.resolve_whatsapp_intake_v3(uuid, uuid, text, text, uuid, text, jsonb)
  to authenticated, service_role;

revoke all on function public.qualify_ambassador_spin_lead_v3(text, text, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.qualify_ambassador_spin_lead_v3(text, text, uuid, uuid, text, text, text)
  to service_role;

commit;
