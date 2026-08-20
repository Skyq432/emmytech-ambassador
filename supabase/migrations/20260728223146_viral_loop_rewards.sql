-- Viral-loop rewards are enforced in Postgres so concurrent requests cannot
-- mint duplicate spins. Daily spins are a non-stacking entitlement; referral,
-- result, and share bonuses continue to accumulate in spins_remaining.

alter table public.spin_players
  add column if not exists daily_spin_available boolean not null default false,
  add column if not exists last_daily_spin_granted_on date;

update public.spin_players
set
  daily_spin_available = coalesce(spins_remaining, 0) > 0,
  last_daily_spin_granted_on = case
    when coalesce(spins_remaining, 0) > 0
      then (now() at time zone 'Africa/Lagos')::date
    else null
  end;

alter table public.spin_players
  alter column daily_spin_available set default true,
  alter column last_daily_spin_granted_on
    set default ((now() at time zone 'Africa/Lagos')::date);

create table if not exists public.spin_share_bonus_claims (
  id uuid primary key default gen_random_uuid(),
  spin_player_id uuid not null
    references public.spin_players(id) on delete cascade,
  spin_log_id uuid not null
    references public.spin_logs(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint spin_share_bonus_claims_spin_log_unique unique (spin_log_id)
);

create index if not exists idx_spin_share_bonus_claims_player
  on public.spin_share_bonus_claims (spin_player_id, created_at desc);

alter table public.spin_share_bonus_claims enable row level security;

create or replace function public.mark_daily_spin_consumed()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.spin_player_id is not null then
    update public.spin_players
    set
      daily_spin_available = false,
      updated_at = now()
    where id = new.spin_player_id
      and daily_spin_available = true;
  end if;

  return new;
end;
$$;

drop trigger if exists spin_logs_mark_daily_consumed on public.spin_logs;
create trigger spin_logs_mark_daily_consumed
after insert on public.spin_logs
for each row execute function public.mark_daily_spin_consumed();

create or replace function public.claim_spin_daily_entitlement(
  p_spin_player_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_player public.spin_players%rowtype;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_next_daily_at timestamptz;
  v_granted boolean := false;
begin
  if p_spin_player_id is null then
    raise exception 'spin_player_id is required' using errcode = '22023';
  end if;

  select *
  into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found then
    raise exception 'Spin player not found' using errcode = 'P0002';
  end if;

  if not coalesce(v_player.daily_spin_available, false)
     and (
       v_player.last_daily_spin_granted_on is null
       or v_player.last_daily_spin_granted_on < v_today
     ) then
    update public.spin_players
    set
      spins_remaining = coalesce(spins_remaining, 0) + 1,
      daily_spin_available = true,
      last_daily_spin_granted_on = v_today,
      updated_at = now()
    where id = p_spin_player_id
    returning * into v_player;

    v_granted := true;
  end if;

  if v_player.daily_spin_available then
    v_next_daily_at := null;
  else
    v_next_daily_at := (
      (coalesce(v_player.last_daily_spin_granted_on, v_today) + 1)::timestamp
      at time zone 'Africa/Lagos'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'granted', v_granted,
    'daily_available', coalesce(v_player.daily_spin_available, false),
    'spins_remaining', coalesce(v_player.spins_remaining, 0),
    'last_daily_spin_granted_on', v_player.last_daily_spin_granted_on,
    'next_daily_at', v_next_daily_at,
    'nigeria_day', v_today
  );
end;
$$;

create or replace function public.claim_spin_share_bonus(
  p_spin_player_id uuid,
  p_spin_log_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_player public.spin_players%rowtype;
  v_claim_id uuid;
begin
  if p_spin_player_id is null or p_spin_log_id is null then
    raise exception 'spin_player_id and spin_log_id are required'
      using errcode = '22023';
  end if;

  select *
  into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found then
    raise exception 'Spin player not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.spin_logs
    where id = p_spin_log_id
      and spin_player_id = p_spin_player_id
  ) then
    raise exception 'Completed spin not found for this player'
      using errcode = 'P0002';
  end if;

  insert into public.spin_share_bonus_claims (spin_player_id, spin_log_id)
  values (p_spin_player_id, p_spin_log_id)
  on conflict (spin_log_id) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    return jsonb_build_object(
      'ok', true,
      'granted', false,
      'reason', 'already_claimed',
      'spins_remaining', coalesce(v_player.spins_remaining, 0)
    );
  end if;

  update public.spin_players
  set
    spins_remaining = coalesce(spins_remaining, 0) + 1,
    updated_at = now()
  where id = p_spin_player_id
  returning * into v_player;

  insert into public.identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata,
    created_at
  )
  values (
    v_player.identity_id,
    'spin_status_share_bonus_awarded',
    'Status share spin awarded',
    'One bonus spin was awarded after the player opened the status share flow.',
    jsonb_build_object(
      'spin_player_id', p_spin_player_id,
      'spin_log_id', p_spin_log_id,
      'spins_awarded', 1
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'reason', 'share_bonus_awarded',
    'spins_remaining', coalesce(v_player.spins_remaining, 0)
  );
end;
$$;

create or replace function public.get_spin_social_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_players', (
      select count(*)
      from public.spin_players
      where nullif(trim(full_name), '') is not null
        and nullif(trim(phone_number), '') is not null
        and nullif(trim(email), '') is not null
    ),
    'total_cash_won', (
      select coalesce(sum(greatest(coalesce(cash_amount, 0), 0)), 0)
      from public.spin_logs
      where result_type = 'cash'
    )
  );
$$;

create or replace function public.claim_canonical_wheel_guest(
  p_session_token text,
  p_full_name text,
  p_phone text,
  p_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session record;
  v_player public.spin_players%rowtype;
  v_session_token text;
begin
  if nullif(trim(p_full_name), '') is null
     or nullif(trim(p_phone), '') is null
     or nullif(lower(trim(p_email)), '') is null then
    raise exception 'Full name, phone number and email are required'
      using errcode = '22023';
  end if;

  if length(trim(p_full_name)) > 200
     or length(trim(p_phone)) > 40
     or length(trim(p_email)) > 320 then
    raise exception 'Registration details are too long'
      using errcode = '22023';
  end if;

  select *
  into strict v_session
  from public.canonical_wheel_session_player(p_session_token);

  update public.identities
  set
    primary_name = trim(p_full_name),
    primary_phone = trim(p_phone),
    primary_email = lower(trim(p_email)),
    updated_at = now()
  where id = v_session.identity_id;

  insert into public.identity_signals (
    identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified,
    source
  )
  values
    (v_session.identity_id, 'phone', lower(trim(p_phone)), 100, true, 'spin_guest_claim'),
    (v_session.identity_id, 'email', lower(trim(p_email)), 100, true, 'spin_guest_claim')
  on conflict (identity_id, signal_type, signal_value)
  do update set
    last_seen_at = now(),
    seen_count = public.identity_signals.seen_count + 1,
    confidence_weight = greatest(public.identity_signals.confidence_weight, 100),
    verified = true;

  update public.spin_players
  set
    full_name = trim(p_full_name),
    phone_number = trim(p_phone),
    email = lower(trim(p_email)),
    updated_at = now()
  where id = v_session.spin_player_id
    and identity_id = v_session.identity_id
  returning * into v_player;

  if not found then
    raise exception 'Guest spin player not found' using errcode = 'P0002';
  end if;

  insert into public.identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata,
    created_at
  )
  values (
    v_session.identity_id,
    'spin_guest_claim_registered',
    'Guest spin registration completed',
    'The guest supplied all required contact details after seeing the spin result.',
    jsonb_build_object('spin_player_id', v_session.spin_player_id),
    now()
  );

  v_session_token := public.issue_canonical_wheel_session(
    v_session.visitor_id,
    v_session.identity_id,
    v_session.spin_player_id
  );

  return jsonb_build_object(
    'spin_player', to_jsonb(v_player),
    'wheel_session_token', v_session_token
  );
end;
$$;

revoke all on table public.spin_share_bonus_claims from public, anon, authenticated;
grant select, insert on table public.spin_share_bonus_claims to service_role;

revoke all on function public.mark_daily_spin_consumed() from public;
revoke all on function public.claim_spin_daily_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.claim_spin_share_bonus(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_spin_social_stats() from public, anon, authenticated;
revoke all on function public.claim_canonical_wheel_guest(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_spin_daily_entitlement(uuid) to service_role;
grant execute on function public.claim_spin_share_bonus(uuid, uuid) to service_role;
grant execute on function public.get_spin_social_stats() to service_role;
grant execute on function public.claim_canonical_wheel_guest(text, text, text, text)
  to service_role;
