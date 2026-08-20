begin;

create table if not exists public.ambassador_referral_attempts (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  attempted_ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  owner_ambassador_id uuid references public.ambassadors(id) on delete set null,
  identity_id uuid references public.identities(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  spin_player_id uuid references public.spin_players(id) on delete set null,
  referral_code text not null,
  source text not null default 'spin_wheel',
  status text not null default 'pending_identity',
  person_label text,
  match_reason text,
  attempt_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ambassador_referral_attempts_visitor_not_blank
    check (length(trim(visitor_id)) between 8 and 200),
  constraint ambassador_referral_attempts_status_check
    check (status in ('pending_identity', 'credited', 'previously_referred', 'failed')),
  constraint ambassador_referral_attempts_attempt_count_check
    check (attempt_count > 0),
  constraint ambassador_referral_attempts_unique
    unique (visitor_id, attempted_ambassador_id, source)
);

create index if not exists ambassador_referral_attempts_attempted_idx
  on public.ambassador_referral_attempts (attempted_ambassador_id, last_seen_at desc);
create index if not exists ambassador_referral_attempts_owner_idx
  on public.ambassador_referral_attempts (owner_ambassador_id, last_seen_at desc);
create index if not exists ambassador_referral_attempts_identity_idx
  on public.ambassador_referral_attempts (identity_id)
  where identity_id is not null;
create index if not exists ambassador_referral_attempts_lead_idx
  on public.ambassador_referral_attempts (lead_id)
  where lead_id is not null;

create table if not exists public.ambassador_notifications (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  referral_attempt_id uuid references public.ambassador_referral_attempts(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint ambassador_notifications_type_check
    check (type in ('previously_referred', 'lead_credited')),
  constraint ambassador_notifications_attempt_type_unique
    unique (referral_attempt_id, type)
);

create index if not exists ambassador_notifications_recipient_idx
  on public.ambassador_notifications (ambassador_id, is_read, created_at desc);

alter table public.ambassador_referral_attempts enable row level security;
alter table public.ambassador_notifications enable row level security;

revoke all on table public.ambassador_referral_attempts from public, anon;
revoke all on table public.ambassador_notifications from public, anon;
grant select on table public.ambassador_referral_attempts to authenticated;
grant select, update on table public.ambassador_notifications to authenticated;
grant all on table public.ambassador_referral_attempts to service_role;
grant all on table public.ambassador_notifications to service_role;

drop policy if exists "Ambassadors view own referral attempts" on public.ambassador_referral_attempts;
create policy "Ambassadors view own referral attempts"
  on public.ambassador_referral_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ambassadors a
      where a.id = ambassador_referral_attempts.attempted_ambassador_id
        and a.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  );

drop policy if exists "Ambassadors view own notifications" on public.ambassador_notifications;
create policy "Ambassadors view own notifications"
  on public.ambassador_notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ambassadors a
      where a.id = ambassador_notifications.ambassador_id
        and a.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and u.role = 'admin'
    )
  );

drop policy if exists "Ambassadors mark own notifications read" on public.ambassador_notifications;
create policy "Ambassadors mark own notifications read"
  on public.ambassador_notifications
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.ambassadors a
      where a.id = ambassador_notifications.ambassador_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.ambassadors a
      where a.id = ambassador_notifications.ambassador_id
        and a.user_id = (select auth.uid())
    )
  );

create or replace function public.record_ambassador_referral_attempt(
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
  v_code text := lower(trim(coalesce(p_referral_code, '')));
  v_visitor text := trim(coalesce(p_visitor_id, ''));
  v_attempted public.ambassadors%rowtype;
  v_owner public.ambassador_spin_attributions%rowtype;
  v_attempt public.ambassador_referral_attempts%rowtype;
begin
  if v_visitor = '' or length(v_visitor) > 200 or v_visitor !~ '^[a-z0-9:_-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_visitor_id');
  end if;

  select a.* into v_attempted
  from public.ambassadors a
  where a.status = 'active'
    and (
      lower(trim(a.referral_code)) = v_code
      or lower(trim(coalesce(a.custom_referral_code, ''))) = v_code
    )
  order by case when lower(trim(coalesce(a.custom_referral_code, ''))) = v_code then 0 else 1 end
  limit 1;

  if v_attempted.id is null then
    return jsonb_build_object('ok', false, 'reason', 'ambassador_not_found');
  end if;

  perform public.track_ambassador_spin_open(v_code, v_visitor, p_ip_address, p_user_agent);

  select asa.* into v_owner
  from public.ambassador_spin_attributions asa
  where asa.visitor_id = v_visitor;

  insert into public.ambassador_referral_attempts (
    visitor_id, attempted_ambassador_id, owner_ambassador_id,
    referral_code, source, status, match_reason
  ) values (
    v_visitor, v_attempted.id, v_owner.ambassador_id,
    coalesce(nullif(trim(v_attempted.custom_referral_code), ''), v_attempted.referral_code),
    'spin_wheel',
    'pending_identity',
    case when v_owner.ambassador_id = v_attempted.id then 'first_touch_owner' else 'first_touch_preserved' end
  )
  on conflict (visitor_id, attempted_ambassador_id, source) do update
  set
    owner_ambassador_id = coalesce(ambassador_referral_attempts.owner_ambassador_id, excluded.owner_ambassador_id),
    attempt_count = ambassador_referral_attempts.attempt_count + 1,
    last_seen_at = now(),
    updated_at = now()
  returning * into v_attempt;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'owner_ambassador_id', v_owner.ambassador_id,
    'attempted_ambassador_id', v_attempted.id,
    'same_ambassador', v_owner.ambassador_id = v_attempted.id,
    'status', v_attempt.status
  );
end;
$$;

create or replace function public.qualify_ambassador_spin_lead_v4(
  p_visitor_id text,
  p_owner_referral_code text,
  p_attempted_referral_code text,
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
  v_attempt_result jsonb;
  v_owner_id uuid;
  v_lead_id uuid;
  v_ok boolean;
  v_person_label text := nullif(trim(coalesce(p_full_name, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_prior_lead public.leads%rowtype;
begin
  v_attempt_result := public.record_ambassador_referral_attempt(
    coalesce(nullif(trim(p_attempted_referral_code), ''), p_owner_referral_code),
    p_visitor_id,
    null,
    null
  );

  if p_identity_id is not null then
    select l.* into v_prior_lead
    from public.leads l
    where l.identity_id = p_identity_id
      and l.merged_into_lead_id is null
    order by coalesce(l.approved_as_lead, false) desc, l.created_at asc
    limit 1;
  end if;

  if v_prior_lead.id is null then
    select l.* into v_prior_lead
    from public.leads l
    where l.merged_into_lead_id is null
      and (
        l.visitor_id = trim(p_visitor_id)
        or coalesce(l.visitor_ids, '[]'::jsonb) @> jsonb_build_array(trim(p_visitor_id))
      )
    order by coalesce(l.approved_as_lead, false) desc, l.created_at asc
    limit 1;
  end if;

  if v_prior_lead.id is null and length(v_phone_digits) >= 7 then
    select l.* into v_prior_lead
    from public.leads l
    where l.merged_into_lead_id is null
      and right(regexp_replace(coalesce(l.customer_phone, ''), '\D', '', 'g'), 10)
        = right(v_phone_digits, 10)
    order by coalesce(l.approved_as_lead, false) desc, l.created_at asc
    limit 1;
  end if;

  if v_prior_lead.id is null and v_email is not null then
    select l.* into v_prior_lead
    from public.leads l
    where l.merged_into_lead_id is null
      and lower(trim(coalesce(l.customer_email, ''))) = v_email
    order by coalesce(l.approved_as_lead, false) desc, l.created_at asc
    limit 1;
  end if;

  v_result := public.qualify_ambassador_spin_lead_v3(
    p_visitor_id,
    p_owner_referral_code,
    p_identity_id,
    p_spin_player_id,
    p_full_name,
    p_phone,
    p_email
  );

  v_ok := coalesce((v_result ->> 'ok')::boolean, false);
  v_lead_id := nullif(v_result ->> 'lead_id', '')::uuid;

  select asa.ambassador_id into v_owner_id
  from public.ambassador_spin_attributions asa
  where asa.visitor_id = trim(p_visitor_id);

  if v_ok
     and v_lead_id is not null
     and v_prior_lead.id = v_lead_id
     and v_prior_lead.ambassador_id is null
     and coalesce(v_prior_lead.approved_as_lead, false)
     and not exists (
       select 1
       from public.point_transactions pt
       where pt.ambassador_id = v_owner_id
         and pt.type = 'lead'
         and pt.reference_id = v_lead_id
         and pt.reference_type in ('lead', 'leads')
     ) then
    update public.ambassadors
    set total_leads = coalesce(total_leads, 0) + 1
    where id = v_owner_id;

    perform public.award_points(
      v_owner_id,
      100,
      'lead',
      v_lead_id,
      'leads',
      'Qualified Spin Wheel referral registration for an unassigned lead'
    );

    update public.ambassador_spin_attributions
    set credited_as_lead = true,
        qualification_status = 'qualified',
        updated_at = now()
    where visitor_id = trim(p_visitor_id);

    update public.referral_clicks
    set counted_as_lead = true,
        match_reason = 'qualified_unassigned_existing_lead'
    where id = (
      select rc.id
      from public.referral_clicks rc
      where rc.visitor_id = trim(p_visitor_id)
        and rc.ambassador_id = v_owner_id
        and rc.source = 'spin_wheel'
      order by rc.created_at desc
      limit 1
    );

    v_result := v_result || jsonb_build_object(
      'credited_as_lead', true,
      'qualification_status', 'qualified',
      'points_awarded', 100,
      'credit_repaired', true
    );
  end if;

  update public.ambassador_referral_attempts ara
  set
    owner_ambassador_id = v_owner_id,
    identity_id = p_identity_id,
    lead_id = v_lead_id,
    spin_player_id = p_spin_player_id,
    person_label = coalesce(v_person_label, ara.person_label, 'Spin Wheel visitor'),
    status = case
      when not v_ok then 'failed'
      when ara.attempted_ambassador_id = v_owner_id then 'credited'
      else 'previously_referred'
    end,
    match_reason = case
      when not v_ok then coalesce(v_result ->> 'reason', v_result ->> 'error', 'qualification_failed')
      when ara.attempted_ambassador_id = v_owner_id then 'permanent_first_touch_owner'
      else 'identity_owned_by_first_ambassador'
    end,
    resolved_at = now(),
    updated_at = now()
  where ara.visitor_id = trim(p_visitor_id)
    and ara.source = 'spin_wheel';

  insert into public.ambassador_notifications (
    ambassador_id, referral_attempt_id, type, title, message
  )
  select
    ara.attempted_ambassador_id,
    ara.id,
    'previously_referred',
    'Previously referred person',
    coalesce(ara.person_label, 'This person') ||
      ' completed Spin Wheel registration, but the first Ambassador attribution was preserved.'
  from public.ambassador_referral_attempts ara
  where ara.visitor_id = trim(p_visitor_id)
    and ara.source = 'spin_wheel'
    and ara.status = 'previously_referred'
  on conflict (referral_attempt_id, type) do nothing;

  return v_result || jsonb_build_object(
    'owner_ambassador_id', v_owner_id,
    'attempted_ambassador_id', nullif(v_attempt_result ->> 'attempted_ambassador_id', '')::uuid,
    'attempt_status', case
      when v_ok and nullif(v_attempt_result ->> 'attempted_ambassador_id', '')::uuid = v_owner_id then 'credited'
      when v_ok then 'previously_referred'
      else 'failed'
    end
  );
end;
$$;

revoke all on function public.record_ambassador_referral_attempt(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.qualify_ambassador_spin_lead_v4(text, text, text, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_ambassador_referral_attempt(text, text, text, text)
  to service_role;
grant execute on function public.qualify_ambassador_spin_lead_v4(text, text, text, uuid, uuid, text, text, text)
  to service_role;

insert into public.ambassador_referral_attempts (
  visitor_id, attempted_ambassador_id, owner_ambassador_id,
  identity_id, lead_id, spin_player_id, referral_code,
  source, status, person_label, match_reason,
  attempt_count, first_seen_at, last_seen_at, resolved_at
)
select
  rc.visitor_id,
  rc.ambassador_id,
  asa.ambassador_id,
  coalesce(rc.identity_id, asa.identity_id),
  coalesce(rc.lead_id, asa.lead_id),
  asa.spin_player_id,
  rc.referral_code,
  'spin_wheel',
  case
    when asa.qualified_at is null then 'pending_identity'
    when rc.ambassador_id = asa.ambassador_id then 'credited'
    else 'previously_referred'
  end,
  null,
  case when rc.ambassador_id = asa.ambassador_id then 'backfilled_first_touch_owner' else 'backfilled_first_touch_preserved' end,
  count(*)::integer,
  min(rc.created_at),
  max(rc.created_at),
  asa.qualified_at
from public.referral_clicks rc
join public.ambassador_spin_attributions asa on asa.visitor_id = rc.visitor_id
where rc.source = 'spin_wheel'
  and rc.visitor_id is not null
  and rc.ambassador_id is not null
group by
  rc.visitor_id, rc.ambassador_id, asa.ambassador_id,
  coalesce(rc.identity_id, asa.identity_id), coalesce(rc.lead_id, asa.lead_id),
  asa.spin_player_id, rc.referral_code, asa.qualified_at
on conflict (visitor_id, attempted_ambassador_id, source) do nothing;

comment on table public.ambassador_referral_attempts is
  'Immutable first-touch ownership with one auditable row per Ambassador who referred the visitor.';
comment on table public.ambassador_notifications is
  'Persistent Ambassador-facing notifications protected by recipient-scoped RLS.';

commit;
