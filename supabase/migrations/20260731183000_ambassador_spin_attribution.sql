begin;

create table if not exists public.ambassador_spin_attributions (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  referral_code text not null,
  open_count integer not null default 1 check (open_count > 0),
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualification_status text not null default 'pending'
    check (qualification_status in ('pending', 'qualified', 'existing_lead', 'conflict')),
  credited_as_lead boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  identity_id uuid references public.identities(id) on delete set null,
  spin_player_id uuid references public.spin_players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ambassador_spin_attributions_visitor_not_blank
    check (nullif(trim(visitor_id), '') is not null),
  constraint ambassador_spin_attributions_visitor_length
    check (length(visitor_id) <= 200)
);

create unique index if not exists ambassador_spin_attributions_visitor_unique
  on public.ambassador_spin_attributions (visitor_id);

create index if not exists ambassador_spin_attributions_ambassador_opened_idx
  on public.ambassador_spin_attributions (ambassador_id, first_opened_at desc);

create index if not exists ambassador_spin_attributions_ambassador_qualified_idx
  on public.ambassador_spin_attributions (ambassador_id, qualified_at desc)
  where qualified_at is not null;

alter table public.ambassador_spin_attributions enable row level security;

revoke all on table public.ambassador_spin_attributions from public, anon;
grant select on table public.ambassador_spin_attributions to authenticated;
grant all on table public.ambassador_spin_attributions to service_role;

drop policy if exists "Ambassadors view own spin attributions"
  on public.ambassador_spin_attributions;
create policy "Ambassadors view own spin attributions"
  on public.ambassador_spin_attributions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ambassadors a
      where a.id = ambassador_spin_attributions.ambassador_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "Admins view all spin attributions"
  on public.ambassador_spin_attributions;
create policy "Admins view all spin attributions"
  on public.ambassador_spin_attributions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'admin'
    )
  );

create or replace function public.track_ambassador_spin_open(
  p_referral_code text,
  p_visitor_id text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clean_code text := lower(trim(coalesce(p_referral_code, '')));
  v_clean_visitor text := trim(coalesce(p_visitor_id, ''));
  v_ambassador public.ambassadors%rowtype;
  v_attribution public.ambassador_spin_attributions%rowtype;
  v_first_touch_created boolean := false;
  v_same_ambassador boolean := false;
begin
  if v_clean_code = ''
     or length(v_clean_code) > 40
     or v_clean_code !~ '^[a-z0-9_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_referral_code');
  end if;

  if v_clean_visitor = ''
     or length(v_clean_visitor) > 200
     or v_clean_visitor !~ '^[a-z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  select a.*
  into v_ambassador
  from public.ambassadors a
  where a.status = 'active'
    and (
      lower(trim(a.referral_code)) = v_clean_code
      or lower(trim(coalesce(a.custom_referral_code, ''))) = v_clean_code
    )
  order by
    case
      when lower(trim(coalesce(a.custom_referral_code, ''))) = v_clean_code then 0
      else 1
    end,
    a.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ambassador_not_found');
  end if;

  insert into public.ambassador_spin_attributions (
    visitor_id,
    ambassador_id,
    referral_code,
    open_count,
    first_opened_at,
    last_opened_at,
    created_at,
    updated_at
  )
  values (
    v_clean_visitor,
    v_ambassador.id,
    coalesce(nullif(trim(v_ambassador.custom_referral_code), ''), v_ambassador.referral_code),
    1,
    now(),
    now(),
    now(),
    now()
  )
  on conflict (visitor_id) do nothing
  returning * into v_attribution;

  if found then
    v_first_touch_created := true;
    v_same_ambassador := true;
  else
    select a.*
    into v_attribution
    from public.ambassador_spin_attributions a
    where a.visitor_id = v_clean_visitor
    for update;

    v_same_ambassador := v_attribution.ambassador_id = v_ambassador.id;

    if v_same_ambassador then
      update public.ambassador_spin_attributions
      set
        open_count = open_count + 1,
        last_opened_at = now(),
        updated_at = now()
      where id = v_attribution.id
      returning * into v_attribution;
    end if;
  end if;

  insert into public.referral_clicks (
    ambassador_id,
    referral_code,
    source,
    ip_address,
    user_agent,
    visitor_id,
    lead_id,
    identity_id,
    counted_as_lead,
    match_score,
    match_reason,
    created_at
  )
  values (
    v_ambassador.id,
    coalesce(nullif(trim(v_ambassador.custom_referral_code), ''), v_ambassador.referral_code),
    'spin_wheel',
    p_ip_address,
    p_user_agent,
    v_clean_visitor,
    case when v_same_ambassador then v_attribution.lead_id else null end,
    case when v_same_ambassador then v_attribution.identity_id else null end,
    false,
    case when v_same_ambassador then 100 else 0 end,
    case
      when v_first_touch_created then 'spin_first_touch_created'
      when v_same_ambassador then 'spin_first_touch_revisited'
      else 'spin_first_touch_preserved_for_other_ambassador'
    end,
    now()
  );

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
    v_clean_visitor,
    v_attribution.ambassador_id,
    v_attribution.referral_code,
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

  insert into public.referral_route_logs (code, step, message, data, created_at)
  values (
    v_clean_code,
    case when v_same_ambassador then 'ambassador_spin_opened' else 'ambassador_spin_conflict' end,
    case
      when v_same_ambassador then 'A browser opened an Ambassador Spin Wheel link.'
      else 'A later Ambassador link was opened, but the original first-touch attribution was preserved.'
    end,
    jsonb_build_object(
      'visitor_id', v_clean_visitor,
      'clicked_ambassador_id', v_ambassador.id,
      'attributed_ambassador_id', v_attribution.ambassador_id,
      'first_touch_created', v_first_touch_created
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'first_touch_created', v_first_touch_created,
    'same_ambassador', v_same_ambassador,
    'ambassador_id', v_attribution.ambassador_id,
    'referral_code', v_attribution.referral_code,
    'open_count', v_attribution.open_count,
    'qualified', v_attribution.qualified_at is not null,
    'credited_as_lead', v_attribution.credited_as_lead
  );
end;
$$;

create or replace function public.qualify_ambassador_spin_lead(
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
  v_clean_visitor text := trim(coalesce(p_visitor_id, ''));
  v_clean_code text := lower(trim(coalesce(p_referral_code, '')));
  v_clean_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_clean_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_clean_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_attribution public.ambassador_spin_attributions%rowtype;
  v_ambassador public.ambassadors%rowtype;
  v_lead public.leads%rowtype;
  v_existing_other_ambassador boolean := false;
  v_new_credit boolean := false;
  v_visitor_ids jsonb;
  v_phone_numbers jsonb;
begin
  if v_clean_visitor = ''
     or length(v_clean_visitor) > 200
     or v_clean_visitor !~ '^[a-z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  select a.*
  into v_attribution
  from public.ambassador_spin_attributions a
  where a.visitor_id = v_clean_visitor
  for update;

  if not found and v_clean_code <> '' then
    perform public.track_ambassador_spin_open(
      v_clean_code,
      v_clean_visitor,
      null,
      null
    );

    select a.*
    into v_attribution
    from public.ambassador_spin_attributions a
    where a.visitor_id = v_clean_visitor
    for update;
  end if;

  if v_attribution.id is null then
    return jsonb_build_object('ok', false, 'reason', 'attribution_not_found');
  end if;

  if v_attribution.qualified_at is not null and v_attribution.lead_id is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'lead_id', v_attribution.lead_id,
      'credited_as_lead', v_attribution.credited_as_lead,
      'qualification_status', v_attribution.qualification_status
    );
  end if;

  select a.*
  into v_ambassador
  from public.ambassadors a
  where a.id = v_attribution.ambassador_id
    and a.status = 'active'
  for update;

  if not found then
    update public.ambassador_spin_attributions
    set
      qualified_at = now(),
      qualification_status = 'conflict',
      identity_id = p_identity_id,
      spin_player_id = p_spin_player_id,
      updated_at = now()
    where id = v_attribution.id;

    return jsonb_build_object('ok', false, 'reason', 'ambassador_inactive');
  end if;

  if p_identity_id is not null then
    select l.*
    into v_lead
    from public.leads l
    where l.identity_id = p_identity_id
      and l.merged_into_lead_id is null
    order by
      coalesce(l.approved_as_lead, false) desc,
      l.created_at asc
    limit 1
    for update;
  end if;

  if v_lead.id is null then
    select l.*
    into v_lead
    from public.leads l
    where l.merged_into_lead_id is null
      and (
        l.visitor_id = v_clean_visitor
        or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(v_clean_visitor)
      )
    order by
      coalesce(l.approved_as_lead, false) desc,
      l.created_at asc
    limit 1
    for update;
  end if;

  if v_lead.id is null and length(v_phone_digits) >= 7 then
    select l.*
    into v_lead
    from public.leads l
    where l.merged_into_lead_id is null
      and right(regexp_replace(coalesce(l.customer_phone, ''), '\D', '', 'g'), 10)
        = right(v_phone_digits, 10)
    order by
      coalesce(l.approved_as_lead, false) desc,
      l.created_at asc
    limit 1
    for update;
  end if;

  if v_lead.id is null and v_clean_email is not null then
    select l.*
    into v_lead
    from public.leads l
    where l.merged_into_lead_id is null
      and lower(trim(coalesce(l.customer_email, ''))) = v_clean_email
    order by
      coalesce(l.approved_as_lead, false) desc,
      l.created_at asc
    limit 1
    for update;
  end if;

  if v_lead.id is not null
     and v_lead.ambassador_id is not null
     and v_lead.ambassador_id is distinct from v_ambassador.id then
    v_existing_other_ambassador := true;
  end if;

  if v_existing_other_ambassador then
    if p_identity_id is not null then
      perform public.detect_identity_ambassador_conflict(
        p_identity_id,
        v_ambassador.id
      );
    end if;

    update public.ambassador_spin_attributions
    set
      qualified_at = now(),
      qualification_status = 'existing_lead',
      credited_as_lead = false,
      lead_id = v_lead.id,
      identity_id = p_identity_id,
      spin_player_id = p_spin_player_id,
      updated_at = now()
    where id = v_attribution.id;

    update public.referral_clicks
    set
      lead_id = v_lead.id,
      identity_id = p_identity_id,
      counted_as_lead = false,
      match_score = 100,
      match_reason = 'existing_lead_owned_by_first_ambassador'
    where id = (
      select rc.id
      from public.referral_clicks rc
      where rc.visitor_id = v_clean_visitor
        and rc.source = 'spin_wheel'
      order by rc.created_at desc
      limit 1
    );

    return jsonb_build_object(
      'ok', true,
      'lead_id', v_lead.id,
      'credited_as_lead', false,
      'qualification_status', 'existing_lead',
      'reason', 'identity_already_attributed'
    );
  end if;

  if v_lead.id is null then
    insert into public.leads (
      ambassador_id,
      identity_id,
      source,
      source_detail,
      customer_name,
      customer_phone,
      customer_email,
      referral_code_used,
      status,
      notes,
      visitor_id,
      lead_type,
      source_page,
      click_count,
      last_clicked_at,
      duplicate_status,
      confidence_score,
      visitor_ids,
      phone_numbers,
      name_history,
      lead_intelligence_status,
      needs_merge_review,
      funnel_stage,
      lead_approval_status,
      approved_as_lead,
      approved_at,
      created_at,
      updated_at
    )
    values (
      v_ambassador.id,
      p_identity_id,
      'referral',
      jsonb_build_object(
        'channel', 'spin_wheel',
        'qualification', 'registered',
        'spin_player_id', p_spin_player_id,
        'visitor_id', v_clean_visitor
      ),
      coalesce(v_clean_name, 'Spin Wheel Lead'),
      coalesce(v_clean_phone, 'Not provided'),
      v_clean_email,
      v_attribution.referral_code,
      'new',
      'Qualified automatically after completing Spin Wheel registration.',
      v_clean_visitor,
      'spin_wheel_registration',
      '/a/' || v_attribution.referral_code,
      greatest(v_attribution.open_count, 1),
      now(),
      'unique',
      100,
      jsonb_build_array(v_clean_visitor),
      case when v_clean_phone is null then '[]'::jsonb else jsonb_build_array(v_clean_phone) end,
      case when v_clean_name is null then '[]'::jsonb else jsonb_build_array(v_clean_name) end,
      'identity_linked',
      false,
      'new_lead',
      'approved',
      true,
      now(),
      now(),
      now()
    )
    returning * into v_lead;

    v_new_credit := true;
  else
    v_new_credit := not coalesce(v_lead.approved_as_lead, false);

    v_visitor_ids := coalesce(v_lead.visitor_ids, '[]'::jsonb);
    if not (v_visitor_ids @> jsonb_build_array(v_clean_visitor)) then
      v_visitor_ids := v_visitor_ids || jsonb_build_array(v_clean_visitor);
    end if;

    v_phone_numbers := coalesce(v_lead.phone_numbers, '[]'::jsonb);
    if v_clean_phone is not null
       and not (v_phone_numbers @> jsonb_build_array(v_clean_phone)) then
      v_phone_numbers := v_phone_numbers || jsonb_build_array(v_clean_phone);
    end if;

    update public.leads
    set
      ambassador_id = coalesce(ambassador_id, v_ambassador.id),
      identity_id = coalesce(identity_id, p_identity_id),
      customer_name = case
        when nullif(trim(coalesce(customer_name, '')), '') is null
          or lower(trim(customer_name)) in ('whatsapp lead', 'anonymous lead', 'spin wheel lead')
        then coalesce(v_clean_name, customer_name)
        else customer_name
      end,
      customer_phone = case
        when nullif(trim(coalesce(customer_phone, '')), '') is null
          or lower(trim(customer_phone)) in ('not provided', 'pending - website')
        then coalesce(v_clean_phone, customer_phone)
        else customer_phone
      end,
      customer_email = coalesce(customer_email, v_clean_email),
      source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object(
        'spin_wheel_registered', true,
        'spin_player_id', p_spin_player_id,
        'spin_visitor_id', v_clean_visitor,
        'spin_referral_code', v_attribution.referral_code
      ),
      visitor_id = coalesce(visitor_id, v_clean_visitor),
      visitor_ids = v_visitor_ids,
      phone_numbers = v_phone_numbers,
      click_count = greatest(coalesce(click_count, 1), v_attribution.open_count),
      last_clicked_at = now(),
      confidence_score = greatest(coalesce(confidence_score, 0), 100),
      lead_intelligence_status = 'identity_linked',
      lead_approval_status = case when v_new_credit then 'approved' else lead_approval_status end,
      approved_as_lead = case when v_new_credit then true else approved_as_lead end,
      approved_at = case when v_new_credit then coalesce(approved_at, now()) else approved_at end,
      updated_at = now()
    where id = v_lead.id
    returning * into v_lead;
  end if;

  if v_new_credit then
    update public.ambassadors
    set total_leads = coalesce(total_leads, 0) + 1
    where id = v_ambassador.id;

    if not exists (
      select 1
      from public.point_transactions pt
      where pt.ambassador_id = v_ambassador.id
        and pt.type = 'lead'
        and pt.reference_id = v_lead.id
        and pt.reference_type in ('lead', 'leads')
    ) then
      perform public.award_points(
        v_ambassador.id,
        100,
        'lead',
        v_lead.id,
        'leads',
        'Qualified Spin Wheel referral registration'
      );
    end if;
  end if;

  insert into public.lead_signals (
    lead_id,
    ambassador_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified
  )
  values (
    v_lead.id,
    v_ambassador.id,
    'visitor_id',
    lower(v_clean_visitor),
    80,
    true
  )
  on conflict (lead_id, signal_type, signal_value)
  do update set
    last_seen_at = now(),
    seen_count = public.lead_signals.seen_count + 1,
    verified = true;

  if v_clean_phone is not null then
    insert into public.lead_signals (
      lead_id,
      ambassador_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified
    )
    values (
      v_lead.id,
      v_ambassador.id,
      'phone',
      v_clean_phone,
      100,
      true
    )
    on conflict (lead_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = public.lead_signals.seen_count + 1,
      verified = true;
  end if;

  if v_clean_email is not null then
    insert into public.lead_signals (
      lead_id,
      ambassador_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified
    )
    values (
      v_lead.id,
      v_ambassador.id,
      'email',
      v_clean_email,
      100,
      true
    )
    on conflict (lead_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = public.lead_signals.seen_count + 1,
      verified = true;
  end if;

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
    v_lead.id,
    v_ambassador.id,
    case when v_new_credit then 'spin_lead_qualified' else 'spin_existing_lead_matched' end,
    case when v_new_credit then 'Spin Wheel lead qualified' else 'Spin registration matched an existing lead' end,
    case
      when v_new_credit then 'A visitor completed Spin Wheel registration and was automatically counted as a qualified Ambassador lead.'
      else 'A visitor completed Spin Wheel registration, but the person was already recorded for this Ambassador.'
    end,
    jsonb_build_object(
      'visitor_id', v_clean_visitor,
      'identity_id', p_identity_id,
      'spin_player_id', p_spin_player_id,
      'referral_code', v_attribution.referral_code,
      'credited_as_lead', v_new_credit
    ),
    now()
  );

  if p_identity_id is not null then
    insert into public.identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata,
      created_at
    )
    values (
      p_identity_id,
      'ambassador_spin_registration',
      'Registered through an Ambassador Spin Wheel link',
      'This identity completed Spin Wheel registration with Ambassador attribution.',
      jsonb_build_object(
        'ambassador_id', v_ambassador.id,
        'lead_id', v_lead.id,
        'spin_player_id', p_spin_player_id,
        'visitor_id', v_clean_visitor,
        'credited_as_lead', v_new_credit
      ),
      now()
    );
  end if;

  update public.ambassador_spin_attributions
  set
    qualified_at = now(),
    qualification_status = case when v_new_credit then 'qualified' else 'existing_lead' end,
    credited_as_lead = v_new_credit,
    lead_id = v_lead.id,
    identity_id = p_identity_id,
    spin_player_id = p_spin_player_id,
    updated_at = now()
  where id = v_attribution.id;

  update public.referral_clicks
  set
    lead_id = v_lead.id,
    identity_id = p_identity_id,
    counted_as_lead = v_new_credit,
    match_score = 100,
    match_reason = case
      when v_new_credit then 'qualified_spin_registration'
      else 'matched_existing_ambassador_lead'
    end
  where id = (
    select rc.id
    from public.referral_clicks rc
    where rc.visitor_id = v_clean_visitor
      and rc.ambassador_id = v_ambassador.id
      and rc.source = 'spin_wheel'
    order by rc.created_at desc
    limit 1
  );

  if v_new_credit then
    insert into public.admin_notifications (
      type,
      title,
      message,
      related_table,
      related_id,
      ambassador_id,
      lead_id,
      is_read,
      created_at
    )
    values (
      'spin_lead_qualified',
      'New qualified Spin Wheel lead',
      coalesce(v_clean_name, 'A visitor') || ' registered through an Ambassador Spin Wheel link.',
      'leads',
      v_lead.id,
      v_ambassador.id,
      v_lead.id,
      false,
      now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'lead_id', v_lead.id,
    'ambassador_id', v_ambassador.id,
    'credited_as_lead', v_new_credit,
    'qualification_status', case when v_new_credit then 'qualified' else 'existing_lead' end,
    'points_awarded', case when v_new_credit then 100 else 0 end
  );
end;
$$;

revoke all on function public.track_ambassador_spin_open(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.qualify_ambassador_spin_lead(text, text, uuid, uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function public.track_ambassador_spin_open(text, text, text, text)
  to service_role;
grant execute on function public.qualify_ambassador_spin_lead(text, text, uuid, uuid, text, text, text)
  to service_role;

commit;
