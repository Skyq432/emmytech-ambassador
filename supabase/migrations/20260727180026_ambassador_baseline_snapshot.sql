


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_commission_to_conversion"("p_admin_id" "uuid", "p_conversion_id" "uuid", "p_commission_percentage" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conversion record;
  v_new_commission numeric;
  v_extra_commission numeric;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can add commission';
  end if;

  if p_commission_percentage is null or p_commission_percentage <= 0 then
    raise exception 'Commission percentage must be greater than zero';
  end if;

  select * into v_conversion
  from conversions
  where id = p_conversion_id
  for update;

  if v_conversion.id is null then
    raise exception 'Conversion not found';
  end if;

  v_new_commission := v_conversion.amount * (p_commission_percentage / 100);
  v_extra_commission := v_new_commission - coalesce(v_conversion.commission_amount, 0);

  update conversions
  set
    commission_amount = v_new_commission,
    commission_rate = p_commission_percentage / 100,
    commission_percentage = p_commission_percentage,
    is_commissionable = true,
    admin_attention_required = false,
    internal_note = coalesce(internal_note, '') || ' | Commission added after review.',
    approved_by = p_admin_id
  where id = p_conversion_id;

  update ambassadors
  set available_balance = coalesce(available_balance, 0) + v_extra_commission
  where id = v_conversion.ambassador_id;

  update admin_notifications
  set is_read = true
  where related_table = 'conversions'
  and related_id = p_conversion_id;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by
  )
  values (
    v_conversion.lead_id,
    v_conversion.ambassador_id,
    'commission_added',
    'Commission added to conversion',
    'Admin added ambassador commission to a reviewed repeat conversion.',
    jsonb_build_object(
      'conversion_id', p_conversion_id,
      'commission_percentage', p_commission_percentage,
      'commission_amount', v_new_commission
    ),
    p_admin_id
  );
end;
$$;


ALTER FUNCTION "public"."add_commission_to_conversion"("p_admin_id" "uuid", "p_conversion_id" "uuid", "p_commission_percentage" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_quote_item"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_product_id" "uuid", "p_item_name" "text", "p_description" "text", "p_quantity" integer, "p_unit_price" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item_id uuid;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can add quote items';
  end if;

  insert into crm_quote_items (
    quote_id,
    product_id,
    item_name,
    description,
    quantity,
    unit_price
  )
  values (
    p_quote_id,
    p_product_id,
    p_item_name,
    p_description,
    coalesce(p_quantity, 1),
    coalesce(p_unit_price, 0)
  )
  returning id into v_item_id;

  update crm_quotes
  set
    subtotal = (
      select coalesce(sum(total_price), 0)
      from crm_quote_items
      where quote_id = p_quote_id
    ),
    total_amount = (
      select coalesce(sum(total_price), 0)
      from crm_quote_items
      where quote_id = p_quote_id
    ) - coalesce(discount_amount, 0),
    updated_at = now()
  where id = p_quote_id;

  return v_item_id;
end;
$$;


ALTER FUNCTION "public"."add_quote_item"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_product_id" "uuid", "p_item_name" "text", "p_description" "text", "p_quantity" integer, "p_unit_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_spin_cash_challenge_win"("p_spin_player_id" "uuid", "p_amount" numeric, "p_spin_log_id" "uuid", "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_player public.spin_players%rowtype;
  v_challenge public.spin_cash_challenges%rowtype;
  v_existing public.spin_cash_challenge_credits%rowtype;
  v_cycle integer;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_credited numeric(14,2);
  v_payload jsonb;
begin
  if p_request_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'A positive cash amount and request_id are required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.spin_cash_challenge_credits
  where request_id = p_request_id;

  if found then
    if v_existing.spin_player_id <> p_spin_player_id then
      raise exception 'request_id belongs to another player' using errcode = '22023';
    end if;
    return public.spin_cash_challenge_payload(p_spin_player_id) || jsonb_build_object(
      'amount_won', v_existing.amount_won,
      'amount_credited', v_existing.amount_credited,
      'balance_before', v_existing.balance_before,
      'balance_after', v_existing.balance_after,
      'capped_amount', greatest(0, v_existing.amount_won - v_existing.amount_credited),
      'idempotent_replay', true
    );
  end if;

  perform public.process_spin_cash_challenge(p_spin_player_id);

  select * into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found or v_player.identity_id is null then
    raise exception 'Spin player or identity not found' using errcode = 'P0002';
  end if;

  select * into v_challenge
  from public.spin_cash_challenges c
  where c.spin_player_id = p_spin_player_id
    and c.status in ('active', 'cash_eligible')
  order by case c.status when 'active' then 0 else 1 end, c.created_at desc
  limit 1
  for update;

  if not found then
    select coalesce(max(cycle_number), 0) + 1
    into v_cycle
    from public.spin_cash_challenges
    where spin_player_id = p_spin_player_id;

    insert into public.spin_cash_challenges (
      identity_id, spin_player_id, cycle_number, status,
      started_at, expires_at, cash_balance, last_credit_at
    ) values (
      v_player.identity_id, p_spin_player_id, v_cycle, 'active',
      now(), now() + interval '24 hours', 0, now()
    ) returning * into v_challenge;
  end if;

  v_before := v_challenge.cash_balance;
  v_after := least(v_challenge.cash_cap, v_before + round(p_amount::numeric, 2));
  v_credited := greatest(0, v_after - v_before);

  update public.spin_cash_challenges
  set cash_balance = v_after,
      last_credit_at = now(),
      updated_at = now()
  where id = v_challenge.id
  returning * into v_challenge;

  insert into public.spin_cash_challenge_credits (
    challenge_id, identity_id, spin_player_id, spin_log_id, request_id,
    amount_won, amount_credited, balance_before, balance_after
  ) values (
    v_challenge.id, v_player.identity_id, p_spin_player_id, p_spin_log_id,
    p_request_id, round(p_amount::numeric, 2), v_credited, v_before, v_after
  );

  update public.spin_players
  set wallet_balance = v_after,
      cashout_eligible = v_challenge.status = 'cash_eligible',
      updated_at = now()
  where id = p_spin_player_id;

  insert into public.identity_events (
    identity_id, event_type, title, description, metadata, created_at
  ) values (
    v_player.identity_id,
    'cash_challenge_win_added',
    'Cash added to 24-hour challenge',
    format('%s cash added to the challenge.', v_credited),
    jsonb_build_object(
      'challenge_id', v_challenge.id,
      'spin_log_id', p_spin_log_id,
      'amount_won', round(p_amount::numeric, 2),
      'amount_credited', v_credited,
      'balance_before', v_before,
      'balance_after', v_after,
      'cash_cap', v_challenge.cash_cap,
      'request_id', p_request_id
    ),
    now()
  );

  v_payload := public.spin_cash_challenge_payload(p_spin_player_id);
  return v_payload || jsonb_build_object(
    'amount_won', round(p_amount::numeric, 2),
    'amount_credited', v_credited,
    'balance_before', v_before,
    'balance_after', v_after,
    'capped_amount', greatest(0, round(p_amount::numeric, 2) - v_credited),
    'challenge_started', v_before = 0 and v_challenge.status = 'active',
    'idempotent_replay', false
  );
end;
$$;


ALTER FUNCTION "public"."add_spin_cash_challenge_win"("p_spin_player_id" "uuid", "p_amount" numeric, "p_spin_log_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_add_ambassador_bonus"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_amount" numeric, "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bonus_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can add bonus';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Bonus amount must be greater than zero';
  end if;

  insert into ambassador_bonuses (
    ambassador_id,
    amount,
    reason,
    added_by,
    created_at
  )
  values (
    p_ambassador_id,
    p_amount,
    p_reason,
    p_admin_id,
    now()
  )
  returning id into v_bonus_id;

  update ambassadors
  set available_balance = coalesce(available_balance, 0) + p_amount
  where id = p_ambassador_id;

  return v_bonus_id;
end;
$$;


ALTER FUNCTION "public"."admin_add_ambassador_bonus"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_amount" numeric, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_adjust_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    if not public.is_cash_off_admin() then
        raise exception 'Only admins can adjust Cash Off'
            using errcode = '42501';
    end if;

    if coalesce(p_amount, 0) = 0 then
        raise exception 'Adjustment amount cannot be zero'
            using errcode = '22023';
    end if;

    if p_amount > 0 then
        return public.cash_off_apply_transaction(
            p_identity_id,
            'credit',
            abs(p_amount),
            'admin_credit',
            'crm_admin',
            null,
            null,
            null,
            auth.uid(),
            p_reason,
            '{}'::jsonb,
            p_idempotency_key
        );
    end if;

    return public.cash_off_apply_transaction(
        p_identity_id,
        'debit',
        abs(p_amount),
        'admin_debit',
        'crm_admin',
        null,
        null,
        null,
        auth.uid(),
        p_reason,
        '{}'::jsonb,
        p_idempotency_key
    );
end;
$$;


ALTER FUNCTION "public"."admin_adjust_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_conversion"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_amount" numeric, "p_commission_percentage" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ambassador_id uuid;
  v_conversion_id uuid;
  v_commission numeric := 0;
  v_commission_rate numeric := 0;
  v_sequence integer := 1;
  v_is_repeat boolean := false;
  v_is_commissionable boolean := true;
begin
  if not exists (
    select 1
    from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can create conversions';
  end if;

  select ambassador_id
  into v_ambassador_id
  from leads
  where id = p_lead_id;

  if v_ambassador_id is null then
    raise exception 'Lead not found';
  end if;

  select count(*) + 1
  into v_sequence
  from conversions
  where lead_id = p_lead_id;

  v_is_repeat := v_sequence > 1;

  if p_commission_percentage is null or p_commission_percentage <= 0 then
    v_is_commissionable := false;
    v_commission := 0;
    v_commission_rate := 0;
  else
    v_is_commissionable := true;
    v_commission_rate := p_commission_percentage / 100;
    v_commission := p_amount * v_commission_rate;
  end if;

  insert into conversions (
    lead_id,
    ambassador_id,
    amount,
    commission_amount,
    commission_rate,
    commission_percentage,
    conversion_sequence,
    is_repeat_conversion,
    is_commissionable,
    ambassador_notified,
    admin_attention_required,
    approved_by,
    approved_at
  )
  values (
    p_lead_id,
    v_ambassador_id,
    p_amount,
    v_commission,
    v_commission_rate,
    p_commission_percentage,
    v_sequence,
    v_is_repeat,
    v_is_commissionable,
    case when v_sequence = 1 then true else false end,
    case when v_sequence > 1 and v_is_commissionable = false then true else false end,
    p_admin_id,
    now()
  )
  returning id into v_conversion_id;

  update leads
  set
    status = 'converted',
    updated_at = now()
  where id = p_lead_id;

  if v_is_commissionable then
    update ambassadors
    set
      total_conversions = coalesce(total_conversions, 0) + 1,
      available_balance = coalesce(available_balance, 0) + v_commission
    where id = v_ambassador_id;
  else
    update ambassadors
    set total_conversions = coalesce(total_conversions, 0) + 1
    where id = v_ambassador_id;
  end if;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by
  )
  values (
    p_lead_id,
    v_ambassador_id,
    case when v_is_repeat then 'repeat_conversion' else 'conversion_created' end,
    case when v_is_repeat then 'Repeat conversion added' else 'Conversion added' end,
    case
      when v_is_repeat and v_is_commissionable = false
        then 'A repeat conversion was added without ambassador commission.'
      when v_is_repeat and v_is_commissionable = true
        then 'A repeat conversion was added with ambassador commission.'
      else 'First conversion was added for this lead.'
    end,
    jsonb_build_object(
      'conversion_id', v_conversion_id,
      'amount', p_amount,
      'commission_percentage', p_commission_percentage,
      'commission_amount', v_commission,
      'sequence', v_sequence,
      'is_repeat_conversion', v_is_repeat,
      'is_commissionable', v_is_commissionable
    ),
    p_admin_id
  );

  if v_is_repeat and v_is_commissionable = false then
    insert into admin_notifications (
      type,
      title,
      message,
      related_table,
      related_id,
      ambassador_id,
      lead_id
    )
    values (
      'repeat_conversion_no_commission',
      'Repeat conversion needs review',
      'A repeat conversion was added without ambassador commission. Review whether this ambassador should receive commission.',
      'conversions',
      v_conversion_id,
      v_ambassador_id,
      p_lead_id
    );
  end if;

  return v_conversion_id;
end;
$$;


ALTER FUNCTION "public"."admin_create_conversion"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_amount" numeric, "p_commission_percentage" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_lead"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_source" "text", "p_notes" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can create leads';
  end if;

  insert into leads (
    ambassador_id,
    source,
    customer_name,
    customer_phone,
    customer_email,
    status,
    notes,
    click_count,
    last_clicked_at,
    created_at,
    updated_at
  )
  values (
    p_ambassador_id,
    coalesce(p_source, 'direct'),
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    'new',
    p_notes,
    1,
    now(),
    now(),
    now()
  )
  returning id into v_lead_id;

  update ambassadors
  set total_leads = coalesce(total_leads, 0) + 1
  where id = p_ambassador_id;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by
  )
  values (
    v_lead_id,
    p_ambassador_id,
    'lead_created',
    'Lead created manually',
    'Admin manually added a lead for this ambassador.',
    jsonb_build_object(
      'customer_name', p_customer_name,
      'customer_phone', p_customer_phone,
      'source', coalesce(p_source, 'direct')
    ),
    p_admin_id
  );

  return v_lead_id;
end;
$$;


ALTER FUNCTION "public"."admin_create_lead"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_source" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_enrich_lead_after_update"("p_admin_id" "uuid", "p_lead_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can enrich leads';
  end if;

  perform public.enrich_identity_from_lead(
    p_lead_id,
    'admin_lead_update'
  );
end;
$$;


ALTER FUNCTION "public"."admin_enrich_lead_after_update"("p_admin_id" "uuid", "p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_activity"("p_activity_id" "uuid", "p_admin_id" "uuid", "p_points" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ambassador_id UUID;
BEGIN
  SELECT ambassador_id INTO v_ambassador_id FROM activities WHERE id = p_activity_id;

  UPDATE activities 
  SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = NOW(), points_awarded = p_points
  WHERE id = p_activity_id;

  PERFORM award_points(v_ambassador_id, p_points, 'post', p_activity_id, 'activities', 'Post approved by admin');
END;
$$;


ALTER FUNCTION "public"."approve_activity"("p_activity_id" "uuid", "p_admin_id" "uuid", "p_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_conversion"("p_lead_id" "uuid", "p_admin_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ambassador_id UUID;
  v_commission DECIMAL;
  v_points INTEGER := 500;
BEGIN
  SELECT ambassador_id INTO v_ambassador_id FROM leads WHERE id = p_lead_id;

  v_commission := p_amount * 0.05;

  INSERT INTO conversions (lead_id, ambassador_id, amount, commission_amount, commission_rate, approved_by, points_generated)
  VALUES (p_lead_id, v_ambassador_id, p_amount, v_commission, 0.05, p_admin_id, v_points);

  UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = p_lead_id;

  PERFORM award_points(v_ambassador_id, v_points, 'conversion', p_lead_id, 'leads', 'Lead converted — sale approved');

  UPDATE ambassadors 
  SET total_leads = total_leads + 1,
      total_conversions = total_conversions + 1
  WHERE id = v_ambassador_id;
END;
$$;


ALTER FUNCTION "public"."approve_conversion"("p_lead_id" "uuid", "p_admin_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_identity_match_merge"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_primary_identity_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_suggestion record;
  v_duplicate_identity_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can approve identity merges';
  end if;

  select *
  into v_suggestion
  from identity_match_suggestions
  where id = p_suggestion_id
  and decision = 'pending'
  for update;

  if v_suggestion.id is null then
    raise exception 'Suggestion not found or already reviewed';
  end if;

  if p_primary_identity_id = v_suggestion.identity_a then
    v_duplicate_identity_id := v_suggestion.identity_b;
  elsif p_primary_identity_id = v_suggestion.identity_b then
    v_duplicate_identity_id := v_suggestion.identity_a;
  else
    raise exception 'Primary identity must be one of the suggested identities';
  end if;

  perform public.merge_identities(
    p_admin_id,
    p_primary_identity_id,
    v_duplicate_identity_id,
    'Merged from duplicate suggestion'
  );

  update identity_match_suggestions
  set
    decision = 'merged',
    reviewed_by = p_admin_id,
    reviewed_at = now()
  where id = p_suggestion_id;
end;
$$;


ALTER FUNCTION "public"."approve_identity_match_merge"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_primary_identity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can approve lead edits';
  end if;

  select * into v_lead
  from leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  update leads
  set
    customer_name = coalesce(v_lead.pending_customer_name, customer_name),
    customer_phone = coalesce(v_lead.pending_customer_phone, customer_phone),
    pending_customer_name = null,
    pending_customer_phone = null,
    edit_status = 'approved',
    updated_at = now()
  where id = p_lead_id;

  if v_lead.pending_customer_phone is not null then
    insert into lead_signals (
      lead_id, ambassador_id, signal_type, signal_value, confidence_weight, verified
    )
    values (
      p_lead_id, v_lead.ambassador_id, 'phone',
      regexp_replace(v_lead.pending_customer_phone, '\s+', '', 'g'),
      100, true
    )
    on conflict (lead_id, signal_type, signal_value)
    do update set verified = true, last_seen_at = now(), seen_count = lead_signals.seen_count + 1;
  end if;

  if v_lead.pending_customer_name is not null then
    insert into lead_signals (
      lead_id, ambassador_id, signal_type, signal_value, confidence_weight, verified
    )
    values (
      p_lead_id, v_lead.ambassador_id, 'name',
      lower(trim(v_lead.pending_customer_name)),
      15, true
    )
    on conflict (lead_id, signal_type, signal_value)
    do update set verified = true, last_seen_at = now(), seen_count = lead_signals.seen_count + 1;
  end if;

  insert into lead_events (
    lead_id, ambassador_id, event_type, event_title, event_description, event_data, created_by
  )
  values (
    p_lead_id,
    v_lead.ambassador_id,
    'edit_approved',
    'Lead update approved',
    'Admin approved ambassador requested lead update.',
    jsonb_build_object(
      'approved_name', v_lead.pending_customer_name,
      'approved_phone', v_lead.pending_customer_phone
    ),
    p_admin_id
  );
end;
$$;


ALTER FUNCTION "public"."approve_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead record;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can approve leads';
  end if;

  select *
  into v_lead
  from leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  if v_lead.approved_as_lead = true then
    return;
  end if;

  update leads
  set
    lead_approval_status = 'approved',
    approved_as_lead = true,
    approved_at = now(),
    approved_by = p_admin_id,
    updated_at = now()
  where id = p_lead_id;

  update ambassadors
  set total_leads = coalesce(total_leads, 0) + 1
  where id = v_lead.ambassador_id;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by
  )
  values (
    p_lead_id,
    v_lead.ambassador_id,
    'lead_approved',
    'Lead approved',
    'This lead was approved and counted for the ambassador.',
    jsonb_build_object(
      'approved_at', now(),
      'approved_by', p_admin_id
    ),
    p_admin_id
  );
end;
$$;


ALTER FUNCTION "public"."approve_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_crm_file"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_sale_id" "uuid", "p_quote_id" "uuid", "p_invoice_id" "uuid", "p_receipt_id" "uuid", "p_file_name" "text", "p_file_url" "text", "p_file_type" "text" DEFAULT NULL::"text", "p_file_size" bigint DEFAULT NULL::bigint, "p_category" "text" DEFAULT 'general'::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_file_id uuid;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can attach CRM files';
  end if;

  insert into crm_files (
    identity_id,
    lead_id,
    sale_id,
    quote_id,
    invoice_id,
    receipt_id,
    file_name,
    file_url,
    file_type,
    file_size,
    category,
    note,
    uploaded_by
  )
  values (
    p_identity_id,
    p_lead_id,
    p_sale_id,
    p_quote_id,
    p_invoice_id,
    p_receipt_id,
    p_file_name,
    p_file_url,
    p_file_type,
    p_file_size,
    coalesce(p_category, 'general'),
    p_note,
    p_admin_id
  )
  returning id into v_file_id;

  if p_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      p_identity_id,
      'file_attached',
      'File attached',
      'A file was attached to this customer record.',
      jsonb_build_object(
        'file_id', v_file_id,
        'file_name', p_file_name,
        'category', p_category,
        'lead_id', p_lead_id,
        'sale_id', p_sale_id,
        'quote_id', p_quote_id,
        'invoice_id', p_invoice_id,
        'receipt_id', p_receipt_id
      )
    );
  end if;

  return v_file_id;
end;
$$;


ALTER FUNCTION "public"."attach_crm_file"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_sale_id" "uuid", "p_quote_id" "uuid", "p_invoice_id" "uuid", "p_receipt_id" "uuid", "p_file_name" "text", "p_file_url" "text", "p_file_type" "text", "p_file_size" bigint, "p_category" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_points"("p_ambassador_id" "uuid", "p_amount" integer, "p_type" "text", "p_reference_id" "uuid", "p_reference_type" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO point_transactions (ambassador_id, amount, type, reference_id, reference_type, reason)
  VALUES (p_ambassador_id, p_amount, p_type, p_reference_id, p_reference_type, p_reason);

  UPDATE ambassadors 
  SET total_points = total_points + p_amount
  WHERE id = p_ambassador_id;
END;
$$;


ALTER FUNCTION "public"."award_points"("p_ambassador_id" "uuid", "p_amount" integer, "p_type" "text", "p_reference_id" "uuid", "p_reference_type" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_spin_referral"("p_referral_code" "text", "p_referred_spin_player_id" "uuid", "p_referred_identity_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_referrer record;
  v_award_id uuid;
begin
  if p_referral_code is null or trim(p_referral_code) = '' then
    return jsonb_build_object('awarded', false, 'reason', 'no_referral_code');
  end if;

  select id, identity_id, referral_code
  into v_referrer
  from public.spin_players
  where referral_code = trim(p_referral_code)
  limit 1;

  if v_referrer.id is null then
    return jsonb_build_object('awarded', false, 'reason', 'referrer_not_found');
  end if;

  if v_referrer.id = p_referred_spin_player_id then
    return jsonb_build_object('awarded', false, 'reason', 'self_referral_blocked');
  end if;

  if v_referrer.identity_id = p_referred_identity_id then
    return jsonb_build_object('awarded', false, 'reason', 'same_identity_blocked');
  end if;

  insert into public.spin_referral_awards (
    referrer_spin_player_id,
    referred_spin_player_id,
    referrer_identity_id,
    referred_identity_id,
    referral_code,
    spins_awarded
  )
  values (
    v_referrer.id,
    p_referred_spin_player_id,
    v_referrer.identity_id,
    p_referred_identity_id,
    trim(p_referral_code),
    1
  )
  on conflict (referred_spin_player_id) do nothing
  returning id into v_award_id;

  if v_award_id is null then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  update public.spin_players
  set
    spins_remaining = coalesce(spins_remaining, 0) + 1,
    total_referrals_count = coalesce(total_referrals_count, 0) + 1,
    updated_at = now()
  where id = v_referrer.id;

  insert into public.identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata,
    created_at
  )
  values (
    v_referrer.identity_id,
    'spin_referral_reward_awarded',
    'Referral spin awarded',
    'A referral completed their first spin, so the referrer received one extra spin.',
    jsonb_build_object(
      'referral_code', trim(p_referral_code),
      'referred_spin_player_id', p_referred_spin_player_id,
      'referred_identity_id', p_referred_identity_id,
      'spins_awarded', 1
    ),
    now()
  );

  return jsonb_build_object(
    'awarded', true,
    'reason', 'referral_spin_awarded',
    'referrer_spin_player_id', v_referrer.id,
    'referrer_identity_id', v_referrer.identity_id,
    'spins_awarded', 1
  );
end;
$$;


ALTER FUNCTION "public"."award_spin_referral"("p_referral_code" "text", "p_referred_spin_player_id" "uuid", "p_referred_identity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_lead_identities"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead record;
  v_identity_id uuid;
  v_signals jsonb;
begin
  for v_lead in
    select *
    from leads
    where identity_id is null
  loop
    v_signals := '[]'::jsonb;

    if v_lead.customer_phone is not null
       and v_lead.customer_phone <> ''
       and lower(v_lead.customer_phone) <> 'not provided' then
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('type', 'phone', 'value', regexp_replace(v_lead.customer_phone, '\s+', '', 'g'))
      );
    end if;

    if v_lead.customer_email is not null and v_lead.customer_email <> '' then
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('type', 'email', 'value', lower(trim(v_lead.customer_email)))
      );
    end if;

    if v_lead.customer_name is not null
       and v_lead.customer_name <> ''
       and lower(v_lead.customer_name) <> 'whatsapp lead' then
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('type', 'name', 'value', lower(trim(v_lead.customer_name)))
      );
    end if;

    if v_lead.ip_signature is not null then
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('type', 'ip_signature', 'value', v_lead.ip_signature)
      );
    end if;

    if v_lead.device_signature is not null then
      v_signals := v_signals || jsonb_build_array(
        jsonb_build_object('type', 'device_signature', 'value', v_lead.device_signature)
      );
    end if;

    if jsonb_array_length(v_signals) = 0 then
      v_signals := jsonb_build_array(
        jsonb_build_object('type', 'legacy_lead', 'value', v_lead.id::text)
      );
    end if;

    v_identity_id := public.upsert_identity_from_signals(
      v_signals,
      nullif(v_lead.customer_name, 'WhatsApp Lead'),
      nullif(v_lead.customer_phone, 'Not provided'),
      v_lead.customer_email,
      'legacy_lead_backfill'
    );

    update leads
    set
      identity_id = v_identity_id,
      updated_at = now()
    where id = v_lead.id;

    update referral_clicks
    set identity_id = v_identity_id
    where lead_id = v_lead.id
    and identity_id is null;

    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_identity_id,
      'legacy_lead_linked',
      'Legacy lead linked',
      'An existing lead was linked to an identity during backfill.',
      jsonb_build_object(
        'lead_id', v_lead.id,
        'lead_code', v_lead.lead_code,
        'source', v_lead.source
      )
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."backfill_lead_identities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_canonical_wheel_visitor"("p_visitor_id" "text", "p_full_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_referral_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_identity_id uuid;
  v_player public.spin_players%rowtype;
  v_signals jsonb;
  v_session_token text;
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if nullif(trim(p_visitor_id), '') is null or length(trim(p_visitor_id)) > 200 then
    raise exception 'A valid visitor_id is required' using errcode = '22023';
  end if;
  if p_full_name is not null and length(trim(p_full_name)) > 200 then raise exception 'Name is too long'; end if;
  if p_phone is not null and length(trim(p_phone)) > 40 then raise exception 'Phone is too long'; end if;
  if p_email is not null and length(trim(p_email)) > 320 then raise exception 'Email is too long'; end if;

  perform public.register_visitor_session(trim(p_visitor_id), p_referral_code, null, null);

  -- A supplied email or phone is stronger than a device/browser visitor id.
  if nullif(lower(trim(p_email)), '') is not null then
    select id into v_identity_id from public.identities
    where lower(trim(primary_email)) = lower(trim(p_email))
    order by updated_at desc nulls last limit 1;
  end if;
  if v_identity_id is null and length(v_phone_digits) >= 7 then
    select id into v_identity_id from public.identities
    where right(regexp_replace(coalesce(primary_phone, ''), '\D', '', 'g'), 10) = right(v_phone_digits, 10)
    order by updated_at desc nulls last limit 1;
  end if;
  if v_identity_id is null and nullif(lower(trim(p_email)), '') is not null then
    select identity_id into v_identity_id from public.identity_signals
    where signal_type = 'email' and lower(trim(signal_value)) = lower(trim(p_email))
    order by verified desc, confidence_weight desc, last_seen_at desc limit 1;
  end if;
  if v_identity_id is null and length(v_phone_digits) >= 7 then
    select identity_id into v_identity_id from public.identity_signals
    where signal_type = 'phone'
      and right(regexp_replace(signal_value, '\D', '', 'g'), 10) = right(v_phone_digits, 10)
    order by verified desc, confidence_weight desc, last_seen_at desc limit 1;
  end if;
  if v_identity_id is null then
    select identity_id into v_identity_id from public.identity_signals
    where signal_type = 'visitor_id' and lower(trim(signal_value)) = lower(trim(p_visitor_id))
    order by last_seen_at desc limit 1;
  end if;

  v_signals := jsonb_build_array(jsonb_build_object('type', 'visitor_id', 'value', trim(p_visitor_id)));
  if nullif(trim(p_phone), '') is not null then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('type', 'phone', 'value', trim(p_phone)));
  end if;
  if nullif(trim(p_email), '') is not null then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object('type', 'email', 'value', lower(trim(p_email))));
  end if;

  if v_identity_id is null then
    v_identity_id := public.upsert_identity_from_signals(
      v_signals, nullif(trim(p_full_name), ''), nullif(trim(p_phone), ''),
      nullif(lower(trim(p_email)), ''), 'website_and_major_wheel'
    );
  else
    update public.identities set
      primary_name = coalesce(primary_name, nullif(trim(p_full_name), '')),
      primary_phone = coalesce(primary_phone, nullif(trim(p_phone), '')),
      primary_email = coalesce(primary_email, nullif(lower(trim(p_email)), '')),
      updated_at = now()
    where id = v_identity_id;
  end if;

  -- A browser belongs to only the contact identity it just confirmed.
  delete from public.identity_signals
  where signal_type = 'visitor_id'
    and lower(trim(signal_value)) = lower(trim(p_visitor_id))
    and identity_id <> v_identity_id;

  insert into public.identity_signals(identity_id, signal_type, signal_value, confidence_weight, verified, source)
  values (v_identity_id, 'visitor_id', lower(trim(p_visitor_id)), 80, true, 'website_and_major_wheel')
  on conflict (identity_id, signal_type, signal_value)
  do update set last_seen_at = now(), seen_count = public.identity_signals.seen_count + 1;

  if nullif(trim(p_phone), '') is not null then
    insert into public.identity_signals(identity_id, signal_type, signal_value, confidence_weight, verified, source)
    values (v_identity_id, 'phone', lower(trim(p_phone)), 100, true, 'website_and_major_wheel')
    on conflict (identity_id, signal_type, signal_value)
    do update set last_seen_at = now(), seen_count = public.identity_signals.seen_count + 1;
  end if;
  if nullif(trim(p_email), '') is not null then
    insert into public.identity_signals(identity_id, signal_type, signal_value, confidence_weight, verified, source)
    values (v_identity_id, 'email', lower(trim(p_email)), 100, true, 'website_and_major_wheel')
    on conflict (identity_id, signal_type, signal_value)
    do update set last_seen_at = now(), seen_count = public.identity_signals.seen_count + 1;
  end if;

  select * into v_player from public.spin_players where identity_id = v_identity_id limit 1;
  if not found then
    insert into public.spin_players(identity_id, full_name, phone_number, email, referral_code, referred_by_referral_code)
    values (v_identity_id, nullif(trim(p_full_name), ''), nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''),
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), nullif(trim(p_referral_code), ''))
    returning * into v_player;
  else
    update public.spin_players set
      full_name = coalesce(full_name, nullif(trim(p_full_name), '')),
      phone_number = coalesce(phone_number, nullif(trim(p_phone), '')),
      email = coalesce(email, nullif(lower(trim(p_email)), '')),
      updated_at = now()
    where id = v_player.id returning * into v_player;
  end if;

  perform public.sync_spin_player_wallet_to_cash_off(v_player.id, 'legacy_spin_wallet');
  v_session_token := public.issue_canonical_wheel_session(trim(p_visitor_id), v_identity_id, v_player.id);
  return jsonb_build_object('wheel_session_token', v_session_token, 'state', public.get_canonical_wheel_state(v_session_token));
end;
$$;


ALTER FUNCTION "public"."bootstrap_canonical_wheel_visitor"("p_visitor_id" "text", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_referral_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonical_wheel_session_player"("p_session_token" "text") RETURNS TABLE("visitor_id" "text", "identity_id" "uuid", "spin_player_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
begin
  if nullif(trim(p_session_token), '') is null
     or length(trim(p_session_token)) <> 64
     or trim(p_session_token) !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid wheel session' using errcode = '22023';
  end if;

  return query
  update public.canonical_wheel_sessions s
  set last_seen_at = now()
  where s.token_hash = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex')
    and s.expires_at > now()
  returning s.visitor_id, s.identity_id, s.spin_player_id;

  if not found then
    raise exception 'Wheel session is invalid or expired' using errcode = '22023';
  end if;
end;
$_$;


ALTER FUNCTION "public"."canonical_wheel_session_player"("p_session_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cash_off_apply_transaction"("p_identity_id" "uuid", "p_direction" "text", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text" DEFAULT 'system'::"text", "p_source_reference" "text" DEFAULT NULL::"text", "p_order_reference" "text" DEFAULT NULL::"text", "p_spin_log_id" "uuid" DEFAULT NULL::"uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_amount numeric(14,2);
    v_before numeric(14,2);
    v_after numeric(14,2);
    v_status text;
    v_transaction_id uuid;
    v_existing public.cash_off_transactions%rowtype;
begin
    if p_identity_id is null then
        raise exception 'identity_id is required'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.identities i
        where i.id = p_identity_id
    ) then
        raise exception 'Identity not found'
            using errcode = 'P0002';
    end if;

    v_amount := round(coalesce(p_amount, 0)::numeric, 2);

    if v_amount <= 0 then
        raise exception 'Cash Off amount must be greater than zero'
            using errcode = '22023';
    end if;

    if p_direction not in ('credit', 'debit') then
        raise exception 'Invalid Cash Off direction'
            using errcode = '22023';
    end if;

    if p_idempotency_key is not null then
        select *
        into v_existing
        from public.cash_off_transactions t
        where t.idempotency_key = p_idempotency_key;

        if found then
            return jsonb_build_object(
                'applied', false,
                'idempotent_replay', true,
                'transaction_id', v_existing.id,
                'identity_id', v_existing.identity_id,
                'direction', v_existing.direction,
                'amount', v_existing.amount,
                'balance_before', v_existing.balance_before,
                'balance_after', v_existing.balance_after
            );
        end if;
    end if;

    insert into public.cash_off_accounts(identity_id)
    values (p_identity_id)
    on conflict (identity_id) do nothing;

    select a.balance, a.status
    into v_before, v_status
    from public.cash_off_accounts a
    where a.identity_id = p_identity_id
    for update;

    -- Re-check after the account lock to make concurrent retries safe.
    if p_idempotency_key is not null then
        select *
        into v_existing
        from public.cash_off_transactions t
        where t.idempotency_key = p_idempotency_key;

        if found then
            return jsonb_build_object(
                'applied', false,
                'idempotent_replay', true,
                'transaction_id', v_existing.id,
                'identity_id', v_existing.identity_id,
                'direction', v_existing.direction,
                'amount', v_existing.amount,
                'balance_before', v_existing.balance_before,
                'balance_after', v_existing.balance_after
            );
        end if;
    end if;

    if v_status = 'closed' then
        raise exception 'Cash Off account is closed'
            using errcode = 'P0001';
    end if;

    if p_direction = 'debit' and v_status = 'frozen' then
        raise exception 'Cash Off account is frozen'
            using errcode = 'P0001';
    end if;

    if p_direction = 'credit' then
        v_after := v_before + v_amount;
    else
        if v_before < v_amount then
            raise exception 'Insufficient Cash Off balance'
                using errcode = 'P0001';
        end if;

        v_after := v_before - v_amount;
    end if;

    update public.cash_off_accounts
    set
        balance = v_after,
        total_credited = total_credited
            + case when p_direction = 'credit' then v_amount else 0 end,
        total_debited = total_debited
            + case when p_direction = 'debit' then v_amount else 0 end,
        total_redeemed = total_redeemed
            + case
                when p_direction = 'debit'
                 and p_transaction_type = 'order_redemption'
                then v_amount
                else 0
              end,
        total_refunded = total_refunded
            + case
                when p_direction = 'credit'
                 and p_transaction_type = 'order_refund'
                then v_amount
                else 0
              end,
        updated_at = now()
    where identity_id = p_identity_id;

    insert into public.cash_off_transactions (
        identity_id,
        direction,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        source_system,
        source_reference,
        order_reference,
        spin_log_id,
        created_by,
        reason,
        metadata,
        idempotency_key
    )
    values (
        p_identity_id,
        p_direction,
        p_transaction_type,
        v_amount,
        v_before,
        v_after,
        coalesce(nullif(btrim(p_source_system), ''), 'system'),
        p_source_reference,
        p_order_reference,
        p_spin_log_id,
        p_created_by,
        p_reason,
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key
    )
    returning id into v_transaction_id;

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
        case
            when p_direction = 'credit'
                then 'cash_off_credited'
            else 'cash_off_debited'
        end,
        case
            when p_direction = 'credit'
                then 'Cash Off credited'
            else 'Cash Off used'
        end,
        coalesce(
            p_reason,
            case
                when p_direction = 'credit'
                    then 'Cash Off was added to the customer account.'
                else 'Cash Off was removed from the customer account.'
            end
        ),
        jsonb_build_object(
            'cash_off_transaction_id', v_transaction_id,
            'direction', p_direction,
            'transaction_type', p_transaction_type,
            'amount', v_amount,
            'balance_before', v_before,
            'balance_after', v_after,
            'source_system', p_source_system,
            'source_reference', p_source_reference,
            'order_reference', p_order_reference,
            'spin_log_id', p_spin_log_id
        ) || coalesce(p_metadata, '{}'::jsonb),
        now()
    );

    return jsonb_build_object(
        'applied', true,
        'idempotent_replay', false,
        'transaction_id', v_transaction_id,
        'identity_id', p_identity_id,
        'direction', p_direction,
        'amount', v_amount,
        'balance_before', v_before,
        'balance_after', v_after
    );
end;
$$;


ALTER FUNCTION "public"."cash_off_apply_transaction"("p_identity_id" "uuid", "p_direction" "text", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_canonical_wheel_spin"("p_session_token" "text", "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session record; v_player public.spin_players%rowtype; v_group record;
  v_item_id uuid; v_next_spin integer; v_result jsonb;
begin
  if p_request_id is null then raise exception 'request_id is required' using errcode = '22023'; end if;
  select * into strict v_session from public.canonical_wheel_session_player(p_session_token);
  if exists (select 1 from public.spin_logs where request_id = p_request_id and spin_player_id = v_session.spin_player_id) then
    return public.complete_cash_off_spin(v_session.spin_player_id, null, null, p_request_id)
      || jsonb_build_object('state', public.get_canonical_wheel_state(p_session_token));
  end if;
  select * into strict v_player from public.spin_players where id = v_session.spin_player_id for update;
  v_next_spin := coalesce(v_player.spin_sequence_step, 0) + 1;
  for v_group in select * from public.spin_rule_groups g
    where g.is_active and v_next_spin >= g.start_spin and (g.end_spin is null or v_next_spin <= g.end_spin)
    order by g.priority, g.start_spin
  loop
    select i.id into v_item_id from public.spin_rule_items i
    where i.group_id = v_group.id and i.is_active
      and (i.result_type <> 'letter' or not coalesce(v_player.letter_challenge_completed, false))
      and (select count(*) from public.spin_user_rule_usage u where u.spin_player_id = v_player.id and u.spin_rule_item_id = i.id) < coalesce(i.max_uses_per_user, 999)
    order by
      case when v_group.group_type in ('fixed','checkpoint','sequence') then i.item_order end,
      case when v_group.group_type not in ('fixed','checkpoint','sequence') then random() end
    limit 1;
    exit when v_item_id is not null;
  end loop;
  if v_item_id is null then raise exception 'No eligible spin result is configured' using errcode = 'P0001'; end if;
  v_result := public.complete_cash_off_spin(v_player.id, v_item_id, v_next_spin, p_request_id);
  return v_result || jsonb_build_object('state', public.get_canonical_wheel_state(p_session_token));
end;
$$;


ALTER FUNCTION "public"."complete_canonical_wheel_spin"("p_session_token" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_cash_challenge_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_player public.spin_players%rowtype;
  v_updated_player public.spin_players%rowtype;
  v_item record;
  v_existing_log public.spin_logs%rowtype;
  v_spin_log public.spin_logs%rowtype;
  v_challenge jsonb;
  v_cash_off_balance numeric(14,2) := 0;
  v_cash_amount numeric(14,2) := 0;
  v_cash_credited numeric(14,2) := 0;
  v_challenge_before numeric(14,2) := 0;
  v_challenge_after numeric(14,2) := 0;
  v_bonus_spins integer := 0;
  v_spin_number integer;
  v_new_spins_remaining integer;
  v_usage_count integer := 0;
  v_letters text[];
  v_next_letter text;
  v_letter_code text;
  v_result_label text;
  v_completed boolean := false;
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select * into v_existing_log
  from public.spin_logs
  where request_id = p_request_id;

  if found then
    if v_existing_log.spin_player_id <> p_spin_player_id then
      raise exception 'request_id belongs to another player' using errcode = '22023';
    end if;

    select * into v_updated_player from public.spin_players where id = p_spin_player_id;
    v_challenge := public.process_spin_cash_challenge(p_spin_player_id);

    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'result', jsonb_build_object(
        'label', v_existing_log.result_label,
        'result_type', v_existing_log.result_type,
        'cash_amount', coalesce(v_existing_log.cash_amount, 0),
        'cash_challenge_credit', coalesce(v_existing_log.cash_challenge_credit, 0),
        'cash_challenge_after', coalesce(v_existing_log.cash_challenge_balance_after, 0),
        'cash_challenge_expires_at', v_existing_log.cash_challenge_expires_at,
        'letter_code', v_existing_log.letter_code,
        'spin_log_id', v_existing_log.id,
        'request_id', p_request_id
      ),
      'cash_challenge', v_challenge,
      'spinPlayer', to_jsonb(v_updated_player)
    );
  end if;

  perform public.process_spin_cash_challenge(p_spin_player_id);

  select * into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found then
    raise exception 'Spin player not found' using errcode = 'P0002';
  end if;

  if v_player.identity_id is null then
    raise exception 'Spin player has no CRM identity' using errcode = 'P0001';
  end if;

  select * into v_existing_log
  from public.spin_logs
  where request_id = p_request_id;

  if found then
    return public.complete_cash_challenge_spin(
      p_spin_player_id, null, null, p_request_id
    );
  end if;

  if coalesce(v_player.spins_remaining, 0) <= 0 then
    raise exception 'No spins left' using errcode = 'P0001';
  end if;

  v_spin_number := coalesce(v_player.spin_sequence_step, 0) + 1;

  if p_expected_spin_number is null or p_expected_spin_number <> v_spin_number then
    raise exception 'Spin sequence changed. Expected %, received %',
      v_spin_number, p_expected_spin_number using errcode = '40001';
  end if;

  select
    i.id, i.result_label, i.result_type, i.cash_amount, i.letter_code,
    i.bonus_spins, i.max_uses_per_user, i.is_active as item_active,
    g.id as group_id, g.group_type, g.start_spin, g.end_spin,
    g.priority, g.is_active as group_active
  into v_item
  from public.spin_rule_items i
  join public.spin_rule_groups g on g.id = i.group_id
  where i.id = p_rule_item_id;

  if not found or coalesce(v_item.item_active, false) = false
     or coalesce(v_item.group_active, false) = false then
    raise exception 'Spin rule item is not active' using errcode = 'P0001';
  end if;

  if v_spin_number < v_item.start_spin
     or (v_item.end_spin is not null and v_spin_number > v_item.end_spin) then
    raise exception 'Spin rule item does not apply to this spin number' using errcode = 'P0001';
  end if;

  if coalesce(v_item.max_uses_per_user, 999) < 999 then
    select count(*) into v_usage_count
    from public.spin_user_rule_usage u
    where u.spin_player_id = v_player.id
      and u.spin_rule_item_id = v_item.id;

    if v_usage_count >= v_item.max_uses_per_user then
      raise exception 'Maximum uses reached for this result' using errcode = 'P0001';
    end if;
  end if;

  v_result_label := v_item.result_label;
  v_letter_code := v_item.letter_code;
  v_cash_amount := round(greatest(coalesce(v_item.cash_amount, 0), 0)::numeric, 2);
  v_bonus_spins := greatest(coalesce(v_item.bonus_spins, 0), 0);
  v_letters := coalesce(v_player.letters_unlocked, '{}'::text[]);

  if v_item.result_type = 'letter' then
    select s.segment_code into v_next_letter
    from public.spin_letter_segments s
    where coalesce(s.is_active, true) = true
      and not (s.segment_code = any(v_letters))
    order by s.segment_order
    limit 1;

    if v_next_letter is not null then
      v_letter_code := v_next_letter;
      v_result_label := v_next_letter;
      if not (v_next_letter = any(v_letters)) then
        v_letters := array_append(v_letters, v_next_letter);
      end if;
    end if;

    select not exists (
      select 1 from public.spin_letter_segments s
      where coalesce(s.is_active, true) = true
        and not (s.segment_code = any(v_letters))
    ) into v_completed;
  else
    v_completed := coalesce(v_player.letter_challenge_completed, false);
  end if;

  v_new_spins_remaining := coalesce(v_player.spins_remaining, 0) - 1 + v_bonus_spins;

  select coalesce(balance, 0) into v_cash_off_balance
  from public.cash_off_accounts
  where identity_id = v_player.identity_id;
  v_cash_off_balance := coalesce(v_cash_off_balance, 0);

  insert into public.spin_logs (
    identity_id, spin_player_id, result_label, result_type, cash_amount,
    letter_code, wallet_before, wallet_after, reward_mode, request_id, created_at,
    cash_off_before, cash_off_after
  ) values (
    v_player.identity_id, v_player.id, v_result_label, v_item.result_type,
    v_cash_amount, v_letter_code, coalesce(v_player.wallet_balance, 0),
    coalesce(v_player.wallet_balance, 0),
    case when v_cash_amount > 0 then 'cash_challenge' else 'canonical_prize' end,
    p_request_id, now(), v_cash_off_balance, v_cash_off_balance
  ) returning * into v_spin_log;

  if v_cash_amount > 0 then
    v_challenge := public.add_spin_cash_challenge_win(
      v_player.id, v_cash_amount, v_spin_log.id, p_request_id
    );
    v_cash_credited := coalesce((v_challenge->>'amount_credited')::numeric, 0);
    v_challenge_before := coalesce((v_challenge->>'balance_before')::numeric, 0);
    v_challenge_after := coalesce((v_challenge->>'balance_after')::numeric, 0);
  else
    v_challenge := public.spin_cash_challenge_payload(v_player.id);
    v_challenge_before := coalesce(v_player.wallet_balance, 0);
    v_challenge_after := coalesce(v_player.wallet_balance, 0);
  end if;

  update public.spin_logs
  set wallet_before = v_challenge_before,
      wallet_after = v_challenge_after,
      cash_challenge_id = nullif(v_challenge->>'id', '')::uuid,
      cash_challenge_credit = v_cash_credited,
      cash_challenge_balance_after = v_challenge_after,
      cash_challenge_expires_at = nullif(v_challenge->>'expires_at', '')::timestamptz
  where id = v_spin_log.id
  returning * into v_spin_log;

  update public.spin_players
  set spins_remaining = v_new_spins_remaining,
      wallet_balance = case when v_cash_amount > 0 then v_challenge_after else wallet_balance end,
      total_cash_won = coalesce(total_cash_won, 0) + v_cash_amount,
      spin_sequence_step = v_spin_number,
      letters_unlocked = v_letters,
      letter_challenge_completed = v_completed,
      last_prize_won = v_result_label,
      last_prize_type = v_item.result_type,
      cashout_eligible = coalesce((v_challenge->>'cash_eligible')::boolean, false),
      updated_at = now()
  where id = v_player.id
  returning * into v_updated_player;

  insert into public.spin_user_rule_usage (
    identity_id, spin_player_id, spin_rule_item_id, spin_number, created_at
  ) values (
    v_player.identity_id, v_player.id, v_item.id, v_spin_number, now()
  );

  if v_item.result_type <> 'retry' then
    insert into public.spin_user_prizes (
      identity_id, spin_player_id, prize_label, status, result_type,
      cash_amount, letter_code, wallet_after, claim_message, reward_mode,
      cash_off_after, created_at
    ) values (
      v_player.identity_id, v_player.id, v_result_label, 'available',
      v_item.result_type, v_cash_amount, v_letter_code, v_challenge_after,
      case when v_cash_amount > 0 then
        format('%s was added to your 24-hour EmmyTech cash challenge.', v_result_label)
      else format('I just won %s on the EmmyTech Spin Wheel.', v_result_label) end,
      case when v_cash_amount > 0 then 'cash_challenge' else 'canonical_prize' end,
      v_cash_off_balance, now()
    );
  end if;

  insert into public.identity_events (
    identity_id, event_type, title, description, metadata, created_at
  ) values (
    v_player.identity_id,
    'cash_challenge_spin_completed',
    'Spin completed',
    format('Spin result: %s', v_result_label),
    jsonb_build_object(
      'spin_player_id', v_player.id,
      'spin_log_id', v_spin_log.id,
      'spin_number', v_spin_number,
      'rule_item_id', v_item.id,
      'result_label', v_result_label,
      'result_type', v_item.result_type,
      'cash_amount_won', v_cash_amount,
      'cash_amount_credited', v_cash_credited,
      'cash_challenge_balance', v_challenge_after,
      'cash_challenge_id', v_challenge->>'id',
      'request_id', p_request_id
    ),
    now()
  );

  if v_spin_number = 1 and v_player.referred_by_referral_code is not null then
    perform public.award_spin_referral(
      v_player.referred_by_referral_code,
      v_player.id,
      v_player.identity_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'result', jsonb_build_object(
      'label', v_result_label,
      'result_type', v_item.result_type,
      'cash_amount', v_cash_amount,
      'cash_challenge_credit', v_cash_credited,
      'cash_challenge_before', v_challenge_before,
      'cash_challenge_after', v_challenge_after,
      'cash_challenge_expires_at', v_challenge->>'expires_at',
      'cash_challenge_started', coalesce((v_challenge->>'challenge_started')::boolean, false),
      'cash_challenge_capped_amount', coalesce((v_challenge->>'capped_amount')::numeric, 0),
      'letter_code', v_letter_code,
      'bonus_spins', v_bonus_spins,
      'letter_challenge_completed', v_completed,
      'spin_log_id', v_spin_log.id,
      'request_id', p_request_id
    ),
    'cash_challenge', v_challenge,
    'spinPlayer', to_jsonb(v_updated_player)
  );
end;
$$;


ALTER FUNCTION "public"."complete_cash_challenge_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_cash_off_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_player public.spin_players%rowtype;
    v_updated_player public.spin_players%rowtype;
    v_item record;
    v_existing_log public.spin_logs%rowtype;
    v_spin_log public.spin_logs%rowtype;
    v_cash_result jsonb;
    v_cash_transaction_id uuid;
    v_cash_before numeric(14,2) := 0;
    v_cash_after numeric(14,2) := 0;
    v_cash_amount numeric(14,2) := 0;
    v_bonus_spins integer := 0;
    v_spin_number integer;
    v_new_spins_remaining integer;
    v_usage_count integer := 0;
    v_letters text[];
    v_next_letter text;
    v_letter_code text;
    v_result_label text;
    v_completed boolean := false;
begin
    if p_request_id is null then
        raise exception 'request_id is required'
            using errcode = '22023';
    end if;

    -- Fast idempotency check.
    select *
    into v_existing_log
    from public.spin_logs sl
    where sl.request_id = p_request_id;

    if found then
        if v_existing_log.spin_player_id <> p_spin_player_id then
            raise exception 'request_id belongs to another player'
                using errcode = '22023';
        end if;

        select *
        into v_updated_player
        from public.spin_players
        where id = p_spin_player_id;

        return jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'result', jsonb_build_object(
                'label', v_existing_log.result_label,
                'result_type', v_existing_log.result_type,
                'cash_off_amount', coalesce(v_existing_log.cash_amount, 0),
                'letter_code', v_existing_log.letter_code,
                'cash_off_before', coalesce(v_existing_log.cash_off_before, 0),
                'cash_off_after', coalesce(v_existing_log.cash_off_after, 0),
                'cash_off_transaction_id',
                    v_existing_log.cash_off_transaction_id,
                'spin_log_id', v_existing_log.id
            ),
            'spinPlayer', to_jsonb(v_updated_player)
        );
    end if;

    select *
    into v_player
    from public.spin_players sp
    where sp.id = p_spin_player_id
    for update;

    if not found then
        raise exception 'Spin player not found'
            using errcode = 'P0002';
    end if;

    if v_player.identity_id is null then
        raise exception 'Spin player has no CRM identity'
            using errcode = 'P0001';
    end if;

    -- Re-check after locking the player so concurrent retries cannot
    -- consume another spin.
    select *
    into v_existing_log
    from public.spin_logs sl
    where sl.request_id = p_request_id;

    if found then
        return jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'result', jsonb_build_object(
                'label', v_existing_log.result_label,
                'result_type', v_existing_log.result_type,
                'cash_off_amount', coalesce(v_existing_log.cash_amount, 0),
                'letter_code', v_existing_log.letter_code,
                'cash_off_before', coalesce(v_existing_log.cash_off_before, 0),
                'cash_off_after', coalesce(v_existing_log.cash_off_after, 0),
                'cash_off_transaction_id',
                    v_existing_log.cash_off_transaction_id,
                'spin_log_id', v_existing_log.id
            ),
            'spinPlayer', to_jsonb(v_player)
        );
    end if;

    if coalesce(v_player.spins_remaining, 0) <= 0 then
        raise exception 'No spins left'
            using errcode = 'P0001';
    end if;

    v_spin_number := coalesce(v_player.spin_sequence_step, 0) + 1;

    if p_expected_spin_number is null
       or p_expected_spin_number <> v_spin_number then
        raise exception
            'Spin sequence changed. Expected %, received %',
            v_spin_number,
            p_expected_spin_number
            using errcode = '40001';
    end if;

    select
        i.id,
        i.result_label,
        i.result_type,
        i.cash_amount,
        i.letter_code,
        i.bonus_spins,
        i.max_uses_per_user,
        i.is_active as item_active,
        g.id as group_id,
        g.group_type,
        g.start_spin,
        g.end_spin,
        g.priority,
        g.is_active as group_active
    into v_item
    from public.spin_rule_items i
    join public.spin_rule_groups g
      on g.id = i.group_id
    where i.id = p_rule_item_id;

    if not found
       or coalesce(v_item.item_active, false) = false
       or coalesce(v_item.group_active, false) = false then
        raise exception 'Spin rule item is not active'
            using errcode = 'P0001';
    end if;

    if v_spin_number < v_item.start_spin
       or (
            v_item.end_spin is not null
            and v_spin_number > v_item.end_spin
       ) then
        raise exception 'Spin rule item does not apply to this spin number'
            using errcode = 'P0001';
    end if;

    if coalesce(v_item.max_uses_per_user, 999) < 999 then
        select count(*)
        into v_usage_count
        from public.spin_user_rule_usage u
        where u.spin_player_id = v_player.id
          and u.spin_rule_item_id = v_item.id;

        if v_usage_count >= v_item.max_uses_per_user then
            raise exception 'Maximum uses reached for this result'
                using errcode = 'P0001';
        end if;
    end if;

    v_result_label := v_item.result_label;
    v_letter_code := v_item.letter_code;
    v_cash_amount := round(
        greatest(coalesce(v_item.cash_amount, 0), 0)::numeric,
        2
    );
    v_bonus_spins := greatest(coalesce(v_item.bonus_spins, 0), 0);
    v_letters := coalesce(v_player.letters_unlocked, '{}'::text[]);

    if v_item.result_type = 'letter' then
        select s.segment_code
        into v_next_letter
        from public.spin_letter_segments s
        where coalesce(s.is_active, true) = true
          and not (s.segment_code = any(v_letters))
        order by s.segment_order
        limit 1;

        if v_next_letter is not null then
            v_letter_code := v_next_letter;
            v_result_label := v_next_letter;

            if not (v_next_letter = any(v_letters)) then
                v_letters := array_append(v_letters, v_next_letter);
            end if;
        end if;

        select not exists (
            select 1
            from public.spin_letter_segments s
            where coalesce(s.is_active, true) = true
              and not (s.segment_code = any(v_letters))
        )
        into v_completed;
    else
        v_completed := coalesce(
            v_player.letter_challenge_completed,
            false
        );
    end if;

    v_new_spins_remaining :=
        coalesce(v_player.spins_remaining, 0)
        - 1
        + v_bonus_spins;

    -- Create the spin log first. The Cash Off transaction and all
    -- other records remain in this same database transaction.
    insert into public.spin_logs (
        identity_id,
        spin_player_id,
        result_label,
        result_type,
        cash_amount,
        letter_code,
        wallet_before,
        wallet_after,
        reward_mode,
        request_id,
        created_at
    )
    values (
        v_player.identity_id,
        v_player.id,
        v_result_label,
        v_item.result_type,
        v_cash_amount,
        v_letter_code,
        coalesce(v_player.wallet_balance, 0),
        coalesce(v_player.wallet_balance, 0),
        'cash_off',
        p_request_id,
        now()
    )
    returning * into v_spin_log;

    if v_cash_amount > 0 then
        v_cash_result := public.credit_cash_off(
            p_identity_id => v_player.identity_id,
            p_amount => v_cash_amount,
            p_transaction_type => 'spin_reward',
            p_source_system => 'spin_wheel',
            p_source_reference => v_spin_log.id::text,
            p_spin_log_id => v_spin_log.id,
            p_reason => format(
                'Won %s Cash Off on the EmmyTech Spin Wheel.',
                trim(to_char(v_cash_amount, 'FM999999999990.00'))
            ),
            p_metadata => jsonb_build_object(
                'spin_player_id', v_player.id,
                'spin_number', v_spin_number,
                'rule_item_id', v_item.id,
                'result_label', v_result_label
            ),
            p_idempotency_key => 'spin-reward:' || p_request_id::text
        );

        v_cash_transaction_id :=
            (v_cash_result ->> 'transaction_id')::uuid;
        v_cash_before :=
            (v_cash_result ->> 'balance_before')::numeric;
        v_cash_after :=
            (v_cash_result ->> 'balance_after')::numeric;
    else
        select coalesce(a.balance, 0)
        into v_cash_before
        from (select 1) seed
        left join public.cash_off_accounts a
          on a.identity_id = v_player.identity_id;

        v_cash_after := v_cash_before;
    end if;

    update public.spin_logs
    set
        cash_off_before = v_cash_before,
        cash_off_after = v_cash_after,
        cash_off_transaction_id = v_cash_transaction_id
    where id = v_spin_log.id
    returning * into v_spin_log;

    update public.spin_players
    set
        spins_remaining = v_new_spins_remaining,
        total_cash_off_won =
            coalesce(total_cash_off_won, 0) + v_cash_amount,
        spin_sequence_step = v_spin_number,
        letters_unlocked = v_letters,
        letter_challenge_completed = v_completed,
        last_prize_won = v_result_label,
        last_prize_type = v_item.result_type,
        updated_at = now()
    where id = v_player.id
    returning * into v_updated_player;

    insert into public.spin_user_rule_usage (
        identity_id,
        spin_player_id,
        spin_rule_item_id,
        spin_number,
        created_at
    )
    values (
        v_player.identity_id,
        v_player.id,
        v_item.id,
        v_spin_number,
        now()
    );

    if v_item.result_type <> 'retry' then
        insert into public.spin_user_prizes (
            identity_id,
            spin_player_id,
            prize_label,
            status,
            result_type,
            cash_amount,
            letter_code,
            wallet_after,
            claim_message,
            reward_mode,
            cash_off_after,
            cash_off_transaction_id,
            created_at
        )
        values (
            v_player.identity_id,
            v_player.id,
            v_result_label,
            'available',
            v_item.result_type,
            v_cash_amount,
            v_letter_code,
            coalesce(v_player.wallet_balance, 0),
            format(
                'I just won %s on the EmmyTech Spin Wheel.',
                v_result_label
            ),
            'cash_off',
            v_cash_after,
            v_cash_transaction_id,
            now()
        );
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
        v_player.identity_id,
        'cash_off_spin_completed',
        'Cash Off spin completed',
        format('Spin result: %s', v_result_label),
        jsonb_build_object(
            'spin_player_id', v_player.id,
            'spin_log_id', v_spin_log.id,
            'spin_number', v_spin_number,
            'rule_item_id', v_item.id,
            'result_label', v_result_label,
            'result_type', v_item.result_type,
            'cash_off_amount', v_cash_amount,
            'cash_off_before', v_cash_before,
            'cash_off_after', v_cash_after,
            'cash_off_transaction_id', v_cash_transaction_id,
            'request_id', p_request_id
        ),
        now()
    );

    if v_spin_number = 1
       and v_player.referred_by_referral_code is not null then
        perform public.award_spin_referral(
            v_player.referred_by_referral_code,
            v_player.id,
            v_player.identity_id
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'idempotent_replay', false,
        'result', jsonb_build_object(
            'label', v_result_label,
            'result_type', v_item.result_type,
            'cash_off_amount', v_cash_amount,
            'letter_code', v_letter_code,
            'bonus_spins', v_bonus_spins,
            'cash_off_before', v_cash_before,
            'cash_off_after', v_cash_after,
            'cash_off_transaction_id', v_cash_transaction_id,
            'letter_challenge_completed', v_completed,
            'spin_log_id', v_spin_log.id,
            'request_id', p_request_id
        ),
        'spinPlayer', to_jsonb(v_updated_player)
    );
end;
$$;


ALTER FUNCTION "public"."complete_cash_off_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_crm_followup"("p_admin_id" "uuid", "p_followup_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_followup record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can complete follow-ups';
  end if;

  select * into v_followup
  from crm_followups
  where id = p_followup_id
  for update;

  if v_followup.id is null then
    raise exception 'Follow-up not found';
  end if;

  update crm_followups
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = p_followup_id;

  insert into identity_events (
    identity_id, event_type, title, description, metadata
  )
  values (
    v_followup.identity_id,
    'followup_completed',
    'Follow-up completed',
    'A CRM follow-up task was completed.',
    jsonb_build_object(
      'followup_id', p_followup_id,
      'note', p_note,
      'completed_by', p_admin_id
    )
  );
end;
$$;


ALTER FUNCTION "public"."complete_crm_followup"("p_admin_id" "uuid", "p_followup_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_website_wheel_handoff"("p_handoff_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
  v_visitor_id text;
  v_session_token text;
begin
  select visitor_id into v_visitor_id
  from public.website_wheel_handoffs
  where token_hash = encode(extensions.digest(trim(p_handoff_token), 'sha256'), 'hex');

  v_result := public.consume_website_wheel_handoff_once(p_handoff_token);
  v_session_token := public.issue_canonical_wheel_session(
    v_visitor_id,
    (v_result->>'identity_id')::uuid,
    (v_result#>>'{spin_player,id}')::uuid
  );

  return v_result || jsonb_build_object('wheel_session_token', v_session_token);
end;
$$;


ALTER FUNCTION "public"."consume_website_wheel_handoff"("p_handoff_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_website_wheel_handoff_once"("p_handoff_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_handoff public.website_wheel_handoffs%rowtype;
  v_identity_id uuid;
  v_player public.spin_players%rowtype;
  v_cash_off_balance numeric(14,2);
begin
  if nullif(trim(p_handoff_token), '') is null
     or length(trim(p_handoff_token)) <> 64
     or trim(p_handoff_token) !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invalid handoff token' using errcode = '22023';
  end if;

  select * into v_handoff
  from public.website_wheel_handoffs
  where token_hash = encode(extensions.digest(trim(p_handoff_token), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Invalid handoff token' using errcode = '22023';
  end if;

  if v_handoff.consumed_at is not null then
    raise exception 'Handoff token has already been consumed' using errcode = '55000';
  end if;

  if v_handoff.expires_at <= now() then
    raise exception 'Handoff token has expired' using errcode = '22023';
  end if;

  update public.website_wheel_handoffs
  set consumed_at = now()
  where token_hash = v_handoff.token_hash;

  select identity_id into v_identity_id
  from public.identity_signals
  where signal_type = 'visitor_id'
    and lower(trim(signal_value)) = lower(trim(v_handoff.visitor_id))
  order by verified desc, confidence_weight desc, first_seen_at
  limit 1;

  if v_identity_id is null then
    v_identity_id := public.upsert_identity_from_signals(
      jsonb_build_array(jsonb_build_object('type', 'visitor_id', 'value', v_handoff.visitor_id)),
      null, null, null, 'website_wheel_handoff'
    );
  end if;

  select * into v_player
  from public.spin_players
  where identity_id = v_identity_id
  limit 1;

  if not found then
    insert into public.spin_players (identity_id, referral_code)
    values (
      v_identity_id,
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    )
    on conflict (identity_id) where identity_id is not null do nothing
    returning * into v_player;

    if not found then
      select * into strict v_player
      from public.spin_players
      where identity_id = v_identity_id;
    end if;
  end if;

  select balance into v_cash_off_balance
  from public.cash_off_accounts
  where identity_id = v_identity_id;

  return jsonb_build_object(
    'identity_id', v_identity_id,
    'spin_player', jsonb_build_object(
      'id', v_player.id,
      'identity_id', v_player.identity_id,
      'full_name', v_player.full_name,
      'phone_number', v_player.phone_number,
      'email', v_player.email,
      'referral_code', v_player.referral_code,
      'referred_by_identity_id', v_player.referred_by_identity_id,
      'spins_remaining', v_player.spins_remaining,
      'wallet_balance', v_player.wallet_balance,
      'total_referrals_count', v_player.total_referrals_count,
      'total_cash_won', v_player.total_cash_won,
      'cashout_target', v_player.cashout_target,
      'spin_sequence_step', v_player.spin_sequence_step,
      'dm_bonus_claimed', v_player.dm_bonus_claimed,
      'letters_unlocked', v_player.letters_unlocked,
      'letter_challenge_completed', v_player.letter_challenge_completed,
      'chosen_letter_reward', v_player.chosen_letter_reward,
      'last_prize_won', v_player.last_prize_won,
      'last_prize_type', v_player.last_prize_type,
      'cashout_eligible', v_player.cashout_eligible,
      'total_cash_off_won', v_player.total_cash_off_won
    ),
    'cash_off_balance', coalesce(v_cash_off_balance, 0),
    'product_id', v_handoff.product_id
  );
end;
$_$;


ALTER FUNCTION "public"."consume_website_wheel_handoff_once"("p_handoff_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_quote_to_sale"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_create_invoice" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_quote record;
  v_sale_id uuid;
  v_invoice_id uuid;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can convert quotes';
  end if;

  select * into v_quote
  from crm_quotes
  where id = p_quote_id;

  if v_quote.id is null then
    raise exception 'Quote not found';
  end if;

  insert into crm_sales (
    identity_id,
    lead_id,
    customer_name,
    customer_phone,
    customer_email,
    total_amount,
    amount_paid,
    status,
    created_by
  )
  values (
    v_quote.identity_id,
    v_quote.lead_id,
    v_quote.customer_name,
    v_quote.customer_phone,
    v_quote.customer_email,
    coalesce(v_quote.total_amount, 0),
    0,
    'draft',
    p_admin_id
  )
  returning id into v_sale_id;

  insert into crm_sale_items (
    sale_id,
    product_id,
    item_name,
    quantity,
    unit_price
  )
  select
    v_sale_id,
    product_id,
    item_name,
    quantity,
    unit_price
  from crm_quote_items
  where quote_id = p_quote_id;

  update crm_quotes
  set
    status = 'accepted',
    updated_at = now()
  where id = p_quote_id;

  if p_create_invoice then
    insert into crm_invoices (
      sale_id,
      status,
      issued_at
    )
    values (
      v_sale_id,
      'issued',
      now()
    )
    returning id into v_invoice_id;
  end if;

  if v_quote.identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_quote.identity_id,
      'quote_converted_to_sale',
      'Quote converted to sale',
      'A quote was accepted and converted into a sale.',
      jsonb_build_object(
        'quote_id', p_quote_id,
        'sale_id', v_sale_id,
        'invoice_id', v_invoice_id
      )
    );
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_id', v_invoice_id
  );
end;
$$;


ALTER FUNCTION "public"."convert_quote_to_sale"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_create_invoice" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_crm_followup"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_priority" "text" DEFAULT 'normal'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_followup_id uuid;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can create follow-ups';
  end if;

  insert into crm_followups (
    identity_id, lead_id, title, description, due_at, priority, created_by
  )
  values (
    p_identity_id, p_lead_id, p_title, p_description, p_due_at, coalesce(p_priority, 'normal'), p_admin_id
  )
  returning id into v_followup_id;

  insert into identity_events (
    identity_id, event_type, title, description, metadata
  )
  values (
    p_identity_id,
    'followup_created',
    'Follow-up created',
    'A CRM follow-up task was created.',
    jsonb_build_object(
      'followup_id', v_followup_id,
      'lead_id', p_lead_id,
      'due_at', p_due_at,
      'priority', p_priority
    )
  );

  return v_followup_id;
end;
$$;


ALTER FUNCTION "public"."create_crm_followup"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_crm_notification"("p_type" "text", "p_title" "text", "p_message" "text", "p_related_entity_type" "text" DEFAULT NULL::"text", "p_related_entity_id" "uuid" DEFAULT NULL::"uuid", "p_identity_id" "uuid" DEFAULT NULL::"uuid", "p_lead_id" "uuid" DEFAULT NULL::"uuid", "p_priority" "text" DEFAULT 'normal'::"text", "p_created_for" "uuid" DEFAULT NULL::"uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notification_id uuid;
begin
  insert into crm_notifications (
    notification_type,
    title,
    message,
    related_entity_type,
    related_entity_id,
    identity_id,
    lead_id,
    priority,
    created_for,
    created_by
  )
  values (
    p_type,
    p_title,
    p_message,
    p_related_entity_type,
    p_related_entity_id,
    p_identity_id,
    p_lead_id,
    coalesce(p_priority, 'normal'),
    p_created_for,
    p_created_by
  )
  returning id into v_notification_id;

  if p_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      p_identity_id,
      'notification_created',
      p_title,
      coalesce(p_message, 'A CRM notification was created.'),
      jsonb_build_object(
        'notification_id', v_notification_id,
        'type', p_type,
        'priority', p_priority,
        'related_entity_type', p_related_entity_type,
        'related_entity_id', p_related_entity_id
      )
    );
  end if;

  return v_notification_id;
end;
$$;


ALTER FUNCTION "public"."create_crm_notification"("p_type" "text", "p_title" "text", "p_message" "text", "p_related_entity_type" "text", "p_related_entity_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_priority" "text", "p_created_for" "uuid", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_crm_quote"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_valid_until" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_quote_id uuid;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can create quotes';
  end if;

  insert into crm_quotes (
    identity_id,
    lead_id,
    customer_name,
    customer_phone,
    customer_email,
    valid_until,
    notes,
    created_by
  )
  values (
    p_identity_id,
    p_lead_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_valid_until,
    p_notes,
    p_admin_id
  )
  returning id into v_quote_id;

  if p_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      p_identity_id,
      'quote_created',
      'Quote created',
      'A quote was created for this customer.',
      jsonb_build_object(
        'quote_id', v_quote_id,
        'lead_id', p_lead_id
      )
    );
  end if;

  return v_quote_id;
end;
$$;


ALTER FUNCTION "public"."create_crm_quote"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_valid_until" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_crm_sale"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_total_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sale_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can create sales';
  end if;

  insert into crm_sales (
    identity_id,
    lead_id,
    customer_name,
    customer_phone,
    customer_email,
    total_amount,
    amount_paid,
    status,
    created_by
  )
  values (
    p_identity_id,
    p_lead_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    coalesce(p_total_amount, 0),
    0,
    'draft',
    p_admin_id
  )
  returning id into v_sale_id;

  if p_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      p_identity_id,
      'sale_created',
      'Sale created',
      'A CRM sale record was created for this customer.',
      jsonb_build_object(
        'sale_id', v_sale_id,
        'lead_id', p_lead_id,
        'total_amount', p_total_amount
      )
    );
  end if;

  return v_sale_id;
end;
$$;


ALTER FUNCTION "public"."create_crm_sale"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_total_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invoice_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invoice_id uuid;
  v_identity_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can create invoices';
  end if;

  select identity_id
  into v_identity_id
  from crm_sales
  where id = p_sale_id;

  insert into crm_invoices (
    sale_id,
    status,
    issued_at,
    due_at
  )
  values (
    p_sale_id,
    'issued',
    now(),
    p_due_at
  )
  returning id into v_invoice_id;

  if v_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_identity_id,
      'invoice_created',
      'Invoice created',
      'An invoice was created for this customer.',
      jsonb_build_object(
        'sale_id', p_sale_id,
        'invoice_id', v_invoice_id
      )
    );
  end if;

  return v_invoice_id;
end;
$$;


ALTER FUNCTION "public"."create_invoice_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_due_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_quote_lead"("p_visitor_id" "text", "p_product_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_email" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_source_page" "text" DEFAULT '/products'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session record;
  v_lead_id uuid;
begin
  select *
  into v_session
  from public.visitor_sessions
  where visitor_id = p_visitor_id
  limit 1;

  insert into public.leads (
    ambassador_id,
    visitor_id,
    product_id,
    source,
    customer_name,
    customer_phone,
    customer_email,
    referral_code_used,
    status,
    lead_type,
    source_page,
    notes,
    created_at,
    updated_at
  )
  values (
    v_session.ambassador_id,
    p_visitor_id,
    p_product_id,
    'website_quote',
    p_full_name,
    p_phone,
    p_email,
    v_session.referral_code,
    'new',
    'quote_request',
    p_source_page,
    p_notes,
    now(),
    now()
  )
  returning id into v_lead_id;

  return jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id
  );
end;
$$;


ALTER FUNCTION "public"."create_quote_lead"("p_visitor_id" "text", "p_product_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_notes" "text", "p_source_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_receipt_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_amount" numeric, "p_payment_method" "text" DEFAULT NULL::"text", "p_payment_reference" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_receipt_id uuid;
  v_identity_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can create receipts';
  end if;

  select identity_id
  into v_identity_id
  from crm_sales
  where id = p_sale_id;

  insert into crm_receipts (
    sale_id,
    amount,
    payment_method,
    payment_reference
  )
  values (
    p_sale_id,
    p_amount,
    p_payment_method,
    p_payment_reference
  )
  returning id into v_receipt_id;

  update crm_sales
  set
    amount_paid = coalesce(amount_paid, 0) + coalesce(p_amount, 0),
    status =
      case
        when coalesce(amount_paid, 0) + coalesce(p_amount, 0) >= total_amount
          then 'paid'
        else 'part_paid'
      end,
    updated_at = now()
  where id = p_sale_id;

  if v_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_identity_id,
      'receipt_created',
      'Receipt created',
      'A receipt/payment was recorded for this customer.',
      jsonb_build_object(
        'sale_id', p_sale_id,
        'receipt_id', v_receipt_id,
        'amount', p_amount,
        'payment_method', p_payment_method
      )
    );
  end if;

  return v_receipt_id;
end;
$$;


ALTER FUNCTION "public"."create_receipt_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_payment_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_website_wheel_handoff"("p_visitor_id" "text", "p_product_id" "uuid" DEFAULT NULL::"uuid", "p_source_path" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_token text;
begin
  if nullif(trim(p_visitor_id), '') is null then
    raise exception 'visitor_id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.visitor_sessions where visitor_id = trim(p_visitor_id)
  ) then
    raise exception 'Visitor session is not registered' using errcode = '23503';
  end if;

  if p_product_id is not null and not exists (
    select 1 from public.products where id = p_product_id and status = 'active'
  ) then
    raise exception 'Product is not available' using errcode = '23503';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.website_wheel_handoffs (
    token_hash, visitor_id, product_id, source_path
  ) values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    trim(p_visitor_id),
    p_product_id,
    left(nullif(trim(p_source_path), ''), 500)
  );

  return v_token;
end;
$$;


ALTER FUNCTION "public"."create_website_wheel_handoff"("p_visitor_id" "text", "p_product_id" "uuid", "p_source_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text" DEFAULT 'system'::"text", "p_source_reference" "text" DEFAULT NULL::"text", "p_order_reference" "text" DEFAULT NULL::"text", "p_spin_log_id" "uuid" DEFAULT NULL::"uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
    select public.cash_off_apply_transaction(
        p_identity_id,
        'credit',
        p_amount,
        p_transaction_type,
        p_source_system,
        p_source_reference,
        p_order_reference,
        p_spin_log_id,
        p_created_by,
        p_reason,
        p_metadata,
        p_idempotency_key
    );
$$;


ALTER FUNCTION "public"."credit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text" DEFAULT 'system'::"text", "p_source_reference" "text" DEFAULT NULL::"text", "p_order_reference" "text" DEFAULT NULL::"text", "p_spin_log_id" "uuid" DEFAULT NULL::"uuid", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
    select public.cash_off_apply_transaction(
        p_identity_id,
        'debit',
        p_amount,
        p_transaction_type,
        p_source_system,
        p_source_reference,
        p_order_reference,
        p_spin_log_id,
        p_created_by,
        p_reason,
        p_metadata,
        p_idempotency_key
    );
$$;


ALTER FUNCTION "public"."debit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_identity_ambassador_conflict"("p_identity_id" "uuid", "p_new_ambassador_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_original_ambassador_id uuid;
begin
  select ambassador_id
  into v_original_ambassador_id
  from leads
  where identity_id = p_identity_id
  and ambassador_id <> p_new_ambassador_id
  order by created_at asc
  limit 1;

  if v_original_ambassador_id is not null then
    insert into identity_ambassador_conflicts (
      identity_id,
      original_ambassador_id,
      new_ambassador_id,
      reason,
      confidence,
      decision
    )
    values (
      p_identity_id,
      v_original_ambassador_id,
      p_new_ambassador_id,
      'Same identity has been referred by another ambassador.',
      100,
      'pending'
    )
    on conflict do nothing;
  end if;
end;
$$;


ALTER FUNCTION "public"."detect_identity_ambassador_conflict"("p_identity_id" "uuid", "p_new_ambassador_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enrich_identity_from_lead"("p_lead_id" "uuid", "p_source" "text" DEFAULT 'lead_update'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead record;
  v_signal jsonb;
  v_identity_id uuid;
begin
  select *
  into v_lead
  from leads
  where id = p_lead_id;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  if v_lead.identity_id is null then
    v_identity_id := public.upsert_identity_from_signals(
      jsonb_build_array(
        jsonb_build_object('type', 'legacy_lead', 'value', v_lead.id::text)
      ),
      nullif(v_lead.customer_name, 'WhatsApp Lead'),
      nullif(v_lead.customer_phone, 'Not provided'),
      v_lead.customer_email,
      p_source
    );

    update leads
    set identity_id = v_identity_id
    where id = p_lead_id;
  else
    v_identity_id := v_lead.identity_id;
  end if;

  if v_lead.customer_name is not null
     and trim(v_lead.customer_name) <> ''
     and lower(v_lead.customer_name) <> 'whatsapp lead' then

    insert into identity_signals (
      identity_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified,
      source
    )
    values (
      v_identity_id,
      'name',
      lower(trim(v_lead.customer_name)),
      20,
      false,
      p_source
    )
    on conflict (identity_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = identity_signals.seen_count + 1;
  end if;

  if v_lead.customer_phone is not null
     and trim(v_lead.customer_phone) <> ''
     and lower(v_lead.customer_phone) <> 'not provided' then

    insert into identity_signals (
      identity_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified,
      source
    )
    values (
      v_identity_id,
      'phone',
      regexp_replace(v_lead.customer_phone, '\s+', '', 'g'),
      100,
      true,
      p_source
    )
    on conflict (identity_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = identity_signals.seen_count + 1,
      verified = true;
  end if;

  if v_lead.customer_email is not null
     and trim(v_lead.customer_email) <> '' then

    insert into identity_signals (
      identity_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified,
      source
    )
    values (
      v_identity_id,
      'email',
      lower(trim(v_lead.customer_email)),
      100,
      true,
      p_source
    )
    on conflict (identity_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = identity_signals.seen_count + 1,
      verified = true;
  end if;

  update identities
  set
    primary_name = coalesce(primary_name, nullif(v_lead.customer_name, 'WhatsApp Lead')),
    primary_phone = coalesce(primary_phone, nullif(v_lead.customer_phone, 'Not provided')),
    primary_email = coalesce(primary_email, v_lead.customer_email),
    updated_at = now()
  where id = v_identity_id;

  insert into identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata
  )
  values (
    v_identity_id,
    'identity_enriched',
    'Identity enriched from lead',
    'Lead information was added to this identity profile.',
    jsonb_build_object(
      'lead_id', p_lead_id,
      'name', v_lead.customer_name,
      'phone', v_lead.customer_phone,
      'email', v_lead.customer_email,
      'source', p_source
    )
  );

  perform public.generate_identity_match_suggestions();
end;
$$;


ALTER FUNCTION "public"."enrich_identity_from_lead"("p_lead_id" "uuid", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_best_identity_match"("p_signals" "jsonb") RETURNS TABLE("identity_id" "uuid", "total_score" integer, "reasons" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with incoming_signals as (
    select
      value->>'type' as signal_type,
      lower(trim(value->>'value')) as signal_value
    from jsonb_array_elements(p_signals)
    where value->>'value' is not null
      and trim(value->>'value') <> ''
  ),
  matched_signals as (
    select
      s.identity_id,
      s.signal_type,
      s.signal_value,
      coalesce(w.weight, 0) as weight
    from identity_signals s
    join incoming_signals i
      on i.signal_type = s.signal_type
     and i.signal_value = lower(trim(s.signal_value))
    left join identity_signal_weights w
      on w.signal_type = s.signal_type
  )
  select
    m.identity_id,
    sum(m.weight)::integer as total_score,
    jsonb_agg(
      jsonb_build_object(
        'signal_type', m.signal_type,
        'signal_value', m.signal_value,
        'weight', m.weight
      )
    ) as reasons
  from matched_signals m
  group by m.identity_id
  order by sum(m.weight) desc
  limit 1;
end;
$$;


ALTER FUNCTION "public"."find_best_identity_match"("p_signals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead_id uuid;
begin
  select id
  into v_lead_id
  from leads
  where ambassador_id = p_ambassador_id
    and visitor_ids ? p_visitor_id
  order by created_at desc
  limit 1;

  if v_lead_id is not null then
    return v_lead_id;
  end if;

  select id
  into v_lead_id
  from leads
  where ambassador_id = p_ambassador_id
    and ip_signature = p_ip_signature
    and device_signature = p_device_signature
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1;

  return v_lead_id;
end;
$$;


ALTER FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_identity_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead_id uuid;
begin
  -- Strong match: same identity + visitor ID
  select id
  into v_lead_id
  from leads
  where ambassador_id = p_ambassador_id
    and identity_id = p_identity_id
    and visitor_ids ? p_visitor_id
  order by created_at desc
  limit 1;

  if v_lead_id is not null then
    return v_lead_id;
  end if;

  -- Fallback match: same IP + same device within 24 hours
  select id
  into v_lead_id
  from leads
  where ambassador_id = p_ambassador_id
    and ip_signature = p_ip_signature
    and device_signature = p_device_signature
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1;

  return v_lead_id;
end;
$$;


ALTER FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_identity_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ambassador_assets"("user_name" "text") RETURNS TABLE("tag" "text", "code" "text", "wa_link" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  clean_name TEXT;
  random_num TEXT;
  base_phone TEXT := '2348146503700';
BEGIN
  clean_name := UPPER(REGEXP_REPLACE(user_name, '[^a-zA-Z0-9]', '', 'g'));
  random_num := LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  tag := '#EMMY_' || SUBSTRING(clean_name, 1, 10);
  code := SUBSTRING(clean_name, 1, 6) || random_num;
  wa_link := 'https://wa.me/' || base_phone || '?text=Hi%20I%20came%20from%20' || code;

  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."generate_ambassador_assets"("user_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_identity_match_suggestions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pair record;
  v_score integer;
  v_reasons jsonb;
begin
  for v_pair in
    select
      a.identity_id as identity_a,
      b.identity_id as identity_b,
      a.signal_type,
      a.signal_value,
      coalesce(w.weight, 0) as weight
    from identity_signals a
    join identity_signals b
      on a.signal_type = b.signal_type
     and a.signal_value = b.signal_value
     and a.identity_id < b.identity_id
    left join identity_signal_weights w
      on w.signal_type = a.signal_type
    join identities ia on ia.id = a.identity_id
    join identities ib on ib.id = b.identity_id
    where ia.status = 'active'
      and ib.status = 'active'
  loop
    select
      sum(coalesce(w.weight, 0))::integer,
      jsonb_agg(
        jsonb_build_object(
          'signal_type', s1.signal_type,
          'signal_value', s1.signal_value,
          'weight', coalesce(w.weight, 0)
        )
      )
    into v_score, v_reasons
    from identity_signals s1
    join identity_signals s2
      on s1.signal_type = s2.signal_type
     and s1.signal_value = s2.signal_value
     and s1.identity_id = v_pair.identity_a
     and s2.identity_id = v_pair.identity_b
    left join identity_signal_weights w
      on w.signal_type = s1.signal_type;

    if coalesce(v_score, 0) >= 70 then
      insert into identity_match_suggestions (
        identity_a,
        identity_b,
        confidence,
        reasons,
        decision,
        created_at
      )
      values (
        v_pair.identity_a,
        v_pair.identity_b,
        v_score,
        coalesce(v_reasons, '[]'::jsonb),
        'pending',
        now()
      )
      on conflict do nothing;
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."generate_identity_match_suggestions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invite_link"("p_admin_id" "uuid", "p_max_uses" integer DEFAULT 1, "p_expiry_days" integer DEFAULT 7) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Check if admin
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can generate invite links';
  END IF;

  -- Generate unique code
  v_code := 'EMMY-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8));

  INSERT INTO invite_links (code, created_by, max_uses, expires_at)
  VALUES (
    v_code, 
    p_admin_id, 
    p_max_uses, 
    CASE WHEN p_expiry_days > 0 THEN now() + (p_expiry_days || ' days')::INTERVAL ELSE NULL END
  );

  RETURN v_code;
END;
$$;


ALTER FUNCTION "public"."generate_invite_link"("p_admin_id" "uuid", "p_max_uses" integer, "p_expiry_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_lead_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.lead_code is null then
    new.lead_code := 'EML-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;

  if new.last_clicked_at is null then
    new.last_clicked_at := now();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."generate_lead_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_canonical_wheel_state"("p_session_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session record;
  v_player public.spin_players%rowtype;
  v_cash_balance numeric(14,2);
  v_challenge jsonb;
begin
  select * into strict v_session from public.canonical_wheel_session_player(p_session_token);
  v_challenge := public.process_spin_cash_challenge(v_session.spin_player_id);
  select * into strict v_player from public.spin_players where id = v_session.spin_player_id;
  select coalesce(balance, 0) into v_cash_balance
  from public.cash_off_accounts where identity_id = v_session.identity_id;

  return jsonb_build_object(
    'server_now', now(),
    'identity_id', v_session.identity_id,
    'spin_player', jsonb_build_object(
      'id', v_player.id,
      'identity_id', v_player.identity_id,
      'full_name', v_player.full_name,
      'referral_code', v_player.referral_code,
      'spins_remaining', v_player.spins_remaining,
      'wallet_balance', v_player.wallet_balance,
      'total_referrals_count', v_player.total_referrals_count,
      'total_cash_won', v_player.total_cash_won,
      'cashout_target', v_player.cashout_target,
      'spin_sequence_step', v_player.spin_sequence_step,
      'dm_bonus_claimed', v_player.dm_bonus_claimed,
      'letters_unlocked', v_player.letters_unlocked,
      'letter_challenge_completed', v_player.letter_challenge_completed,
      'chosen_letter_reward', v_player.chosen_letter_reward,
      'last_prize_won', v_player.last_prize_won,
      'last_prize_type', v_player.last_prize_type,
      'cashout_eligible', v_player.cashout_eligible,
      'total_cash_off_won', v_player.total_cash_off_won
    ),
    'cash_challenge', v_challenge,
    'cash_off_balance', coalesce(v_cash_balance, 0),
    'active_prizes', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at)
      from public.spin_prizes p where p.is_active and p.on_wheel
    ), '[]'::jsonb),
    'rule_groups', coalesce((
      select jsonb_agg(to_jsonb(g) || jsonb_build_object('items', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.item_order)
        from public.spin_rule_items i where i.group_id = g.id and i.is_active
      ), '[]'::jsonb)) order by g.priority)
      from public.spin_rule_groups g where g.is_active
    ), '[]'::jsonb),
    'awarded_prizes', coalesce((
      select jsonb_agg(to_jsonb(up) order by up.created_at desc)
      from public.spin_user_prizes up where up.spin_player_id = v_player.id
    ), '[]'::jsonb),
    'referral_count', (
      select count(*) from public.spin_referrals r
      where r.referrer_spin_player_id = v_player.id and r.status = 'converted'
    )
  );
end;
$$;


ALTER FUNCTION "public"."get_canonical_wheel_state"("p_session_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cash_off_balance"("p_identity_id" "uuid") RETURNS TABLE("identity_id" "uuid", "balance" numeric, "total_credited" numeric, "total_debited" numeric, "total_redeemed" numeric, "total_refunded" numeric, "status" "text", "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
    select
        p_identity_id,
        coalesce(a.balance, 0),
        coalesce(a.total_credited, 0),
        coalesce(a.total_debited, 0),
        coalesce(a.total_redeemed, 0),
        coalesce(a.total_refunded, 0),
        coalesce(a.status, 'active'),
        a.updated_at
    from (select 1) seed
    left join public.cash_off_accounts a
      on a.identity_id = p_identity_id;
$$;


ALTER FUNCTION "public"."get_cash_off_balance"("p_identity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_crm_activity_feed"("p_limit" integer DEFAULT 100) RETURNS TABLE("source" "text", "title" "text", "description" "text", "identity_id" "uuid", "lead_id" "uuid", "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    'identity_event'::text,
    title,
    description,
    identity_id,
    null::uuid as lead_id,
    metadata,
    created_at
  from identity_events

  union all

  select
    'lead_event'::text,
    event_title,
    event_description,
    null::uuid as identity_id,
    lead_id,
    event_data,
    created_at
  from lead_events

  union all

  select
    'followup'::text,
    title,
    description,
    identity_id,
    lead_id,
    jsonb_build_object('status', status, 'priority', priority, 'due_at', due_at),
    created_at
  from crm_followups

  order by created_at desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."get_crm_activity_feed"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_crm_dashboard_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'total_identities', (select count(*) from identities where status = 'active'),
    'total_leads', (select count(*) from leads),
    'total_sales', (select count(*) from crm_sales),
    'total_revenue', (select coalesce(sum(total_amount), 0) from crm_sales),
    'total_paid', (select coalesce(sum(amount_paid), 0) from crm_sales),
    'total_balance_due', (select coalesce(sum(balance_due), 0) from crm_sales),
    'pending_merge_suggestions', (
      select count(*) from identity_match_suggestions where decision = 'pending'
    ),
    'pending_ambassador_conflicts', (
      select count(*) from identity_ambassador_conflicts where decision = 'pending'
    ),
    'pending_invoices', (
      select count(*) from crm_invoices where status in ('draft', 'issued')
    ),
    'new_leads_today', (
      select count(*) from leads where created_at::date = current_date
    ),
    'sales_today', (
      select coalesce(sum(total_amount), 0)
      from crm_sales
      where created_at::date = current_date
    )
  )
  into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_crm_dashboard_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_crm_funnel_summary"() RETURNS TABLE("stage_key" "text", "stage_name" "text", "stage_order" integer, "lead_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    s.stage_key,
    s.stage_name,
    s.stage_order,
    count(l.id) as lead_count
  from crm_funnel_stages s
  left join leads l
    on l.funnel_stage = s.stage_key
  where s.is_active = true
  group by s.stage_key, s.stage_name, s.stage_order
  order by s.stage_order asc;
$$;


ALTER FUNCTION "public"."get_crm_funnel_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_journey_summary"("p_identity_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'identity', (
      select jsonb_build_object(
        'id', id,
        'identity_code', identity_code,
        'primary_name', primary_name,
        'primary_phone', primary_phone,
        'primary_email', primary_email,
        'status', status,
        'confidence_score', confidence_score,
        'created_at', created_at
      )
      from identities
      where id = p_identity_id
    ),
    'signals', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'type', signal_type,
          'value', signal_value,
          'weight', confidence_weight,
          'verified', verified,
          'seen_count', seen_count,
          'last_seen_at', last_seen_at
        )
        order by confidence_weight desc, last_seen_at desc
      ), '[]'::jsonb)
      from identity_signals
      where identity_id = p_identity_id
    ),
    'leads', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'lead_code', lead_code,
          'customer_name', customer_name,
          'customer_phone', customer_phone,
          'source', source,
          'status', status,
          'funnel_stage', funnel_stage,
          'created_at', created_at
        )
        order by created_at desc
      ), '[]'::jsonb)
      from leads
      where identity_id = p_identity_id
    ),
    'sales', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'sale_code', sale_code,
          'total_amount', total_amount,
          'amount_paid', amount_paid,
          'balance_due', balance_due,
          'status', status,
          'created_at', created_at
        )
        order by created_at desc
      ), '[]'::jsonb)
      from crm_sales
      where identity_id = p_identity_id
    ),
    'followups', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', id,
          'title', title,
          'status', status,
          'priority', priority,
          'due_at', due_at
        )
        order by due_at asc nulls last
      ), '[]'::jsonb)
      from crm_followups
      where identity_id = p_identity_id
    )
  )
  into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_customer_journey_summary"("p_identity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity_files"("p_identity_id" "uuid") RETURNS TABLE("id" "uuid", "file_name" "text", "file_url" "text", "file_type" "text", "file_size" bigint, "category" "text", "note" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    id,
    file_name,
    file_url,
    file_type,
    file_size,
    category,
    note,
    created_at
  from crm_files
  where identity_id = p_identity_id
  order by created_at desc;
$$;


ALTER FUNCTION "public"."get_identity_files"("p_identity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_identity_timeline"("p_identity_id" "uuid") RETURNS TABLE("event_source" "text", "event_type" "text", "title" "text", "description" "text", "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    'identity'::text as event_source,
    event_type,
    title,
    description,
    metadata,
    created_at
  from identity_events
  where identity_id = p_identity_id

  union all

  select
    'lead'::text as event_source,
    le.event_type,
    le.event_title as title,
    le.event_description as description,
    le.event_data as metadata,
    le.created_at
  from lead_events le
  join leads l on l.id = le.lead_id
  where l.identity_id = p_identity_id

  order by created_at desc;
$$;


ALTER FUNCTION "public"."get_identity_timeline"("p_identity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_overdue_followups"() RETURNS TABLE("followup_id" "uuid", "identity_id" "uuid", "lead_id" "uuid", "title" "text", "description" "text", "priority" "text", "due_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    id,
    identity_id,
    lead_id,
    title,
    description,
    priority,
    due_at,
    created_at
  from crm_followups
  where status = 'pending'
  and due_at is not null
  and due_at < now()
  order by due_at asc;
$$;


ALTER FUNCTION "public"."get_overdue_followups"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_customer_identities"("p_limit" integer DEFAULT 10) RETURNS TABLE("identity_id" "uuid", "identity_code" "text", "primary_name" "text", "primary_phone" "text", "primary_email" "text", "total_leads" bigint, "total_conversions" bigint, "total_sales" bigint, "lifetime_revenue" numeric, "lifetime_paid" numeric, "lifetime_balance_due" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    identity_id,
    identity_code,
    primary_name,
    primary_phone,
    primary_email,
    total_leads,
    total_conversions,
    total_sales,
    lifetime_revenue,
    lifetime_paid,
    lifetime_balance_due
  from identity_lifetime_value
  order by lifetime_revenue desc, lifetime_paid desc
  limit p_limit;
$$;


ALTER FUNCTION "public"."get_top_customer_identities"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_crm_notifications"("p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "notification_type" "text", "title" "text", "message" "text", "related_entity_type" "text", "related_entity_id" "uuid", "identity_id" "uuid", "lead_id" "uuid", "priority" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    id,
    notification_type,
    title,
    message,
    related_entity_type,
    related_entity_id,
    identity_id,
    lead_id,
    priority,
    created_at
  from crm_notifications
  where status = 'unread'
  and (
    p_user_id is null
    or created_for is null
    or created_for = p_user_id
  )
  order by
    case priority
      when 'urgent' then 1
      when 'high' then 2
      when 'normal' then 3
      else 4
    end,
    created_at desc;
$$;


ALTER FUNCTION "public"."get_unread_crm_notifications"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_invite_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invite_code text;
  new_role text;
  clean_name text;
  clean_tag text;
  clean_custom_code text;
begin
  invite_code := new.raw_user_meta_data->>'invite_code';
  new_role := coalesce(new.raw_user_meta_data->>'role', 'ambassador');
  clean_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  clean_tag := upper(replace(clean_name, ' ', ''));
  clean_custom_code := lower(
    regexp_replace(
      replace(clean_name, ' ', ''),
      '[^a-zA-Z0-9_-]',
      '',
      'g'
    )
  );

  insert into public.users (id, email, name, role, created_at)
  values (new.id, new.email, clean_name, new_role, now())
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role;

  if new_role = 'ambassador' then
    insert into public.ambassadors (
      user_id,
      ambassador_tag,
      referral_code,
      custom_referral_code,
      custom_referral_code_set,
      whatsapp_number,
      whatsapp_link,
      bio,
      social_links,
      total_points,
      total_leads,
      total_conversions,
      available_balance,
      total_cashed_out,
      status,
      created_at
    )
    values (
      new.id,
      '#' || clean_tag,
      clean_tag || floor(random() * 9000 + 1000)::text,
      clean_custom_code,
      true,
      '2348146503700',
      'https://ambassador.emmytechnology.com/r/' || clean_custom_code,
      null,
      '{}'::jsonb,
      0,
      0,
      0,
      0,
      0,
      'active',
      now()
    )
    on conflict (user_id) do nothing;

    if invite_code is not null then
      update public.invite_links
      set used_count = coalesce(used_count, 0) + 1
      where code = invite_code;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_invite_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_ambassador_tag TEXT;
  v_referral_code TEXT;
  v_whatsapp_link TEXT;
  v_name TEXT;
  v_random TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_random := SUBSTRING(MD5(RANDOM()::TEXT), 1, 4);
  
  INSERT INTO users (id, name, email, role)
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'ambassador')
  )
  ON CONFLICT (id) DO NOTHING;

  IF COALESCE(NEW.raw_user_meta_data->>'role', 'ambassador') = 'ambassador' THEN
    v_ambassador_tag := '#EMMY_' || UPPER(REGEXP_REPLACE(v_name, '[^a-zA-Z0-9]', '', 'g')) || '_' || v_random;
    v_referral_code := UPPER(REGEXP_REPLACE(v_name, '[^a-zA-Z0-9]', '', 'g')) || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    v_whatsapp_link := 'https://wa.me/2348146503700?text=Hi%20I%20came%20from%20' || v_referral_code;

    INSERT INTO ambassadors (user_id, ambassador_tag, referral_code, whatsapp_number, whatsapp_link, status)
    VALUES (NEW.id, v_ambassador_tag, v_referral_code, '+2348146503700', v_whatsapp_link, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hard_delete_ambassador"("p_ambassador_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
    and role = 'admin'
  ) then
    raise exception 'Only admins can hard delete ambassadors';
  end if;

  delete from public.cart_events
  where ambassador_id = p_ambassador_id;

  delete from public.product_views
  where ambassador_id = p_ambassador_id;

  delete from public.visitor_sessions
  where ambassador_id = p_ambassador_id;

  delete from public.referral_clicks
  where ambassador_id = p_ambassador_id;

  delete from public.payouts
  where ambassador_id = p_ambassador_id;

  delete from public.point_transactions
  where ambassador_id = p_ambassador_id;

  delete from public.conversions
  where ambassador_id = p_ambassador_id;

  delete from public.leads
  where ambassador_id = p_ambassador_id;

  delete from public.activities
  where ambassador_id = p_ambassador_id;

  delete from public.ambassadors
  where id = p_ambassador_id;
end;
$$;


ALTER FUNCTION "public"."hard_delete_ambassador"("p_ambassador_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_sms_outreach_labels"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  affected integer := 0;
begin
  with incoming as (
    select
      public.normalize_ng_phone(item->>'phone_number') as phone_normalized,
      case
        when item->>'outreach_status' in ('not_messaged','messaged','messaged_us_before','excluded')
          then item->>'outreach_status'
        else 'not_messaged'
      end as outreach_status
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) item
  )
  update public.sms_leads lead
  set
    whatsapp_outreach_status = incoming.outreach_status,
    outreach_status_source = 'old_spin_outreach_csv',
    outreach_status_imported_at = now()
  from incoming
  where incoming.phone_normalized is not null
    and lead.phone_normalized = incoming.phone_normalized;

  get diagnostics affected = row_count;
  return affected;
end;
$$;


ALTER FUNCTION "public"."import_sms_outreach_labels"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_cash_off_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
    select exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.role = 'admin'
    );
$$;


ALTER FUNCTION "public"."is_cash_off_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_canonical_wheel_session"("p_visitor_id" "text", "p_identity_id" "uuid", "p_spin_player_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_token text;
begin
  if nullif(trim(p_visitor_id), '') is null or p_identity_id is null or p_spin_player_id is null then
    raise exception 'A visitor, identity and spin player are required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.spin_players
    where id = p_spin_player_id and identity_id = p_identity_id
  ) then
    raise exception 'Spin player does not belong to identity' using errcode = '22023';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.canonical_wheel_sessions(token_hash, visitor_id, identity_id, spin_player_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), trim(p_visitor_id), p_identity_id, p_spin_player_id);
  return v_token;
end;
$$;


ALTER FUNCTION "public"."issue_canonical_wheel_session"("p_visitor_id" "text", "p_identity_id" "uuid", "p_spin_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_identities_separate"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_suggestion record;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can review identity suggestions';
  end if;

  select *
  into v_suggestion
  from identity_match_suggestions
  where id = p_suggestion_id
  and decision = 'pending'
  for update;

  if v_suggestion.id is null then
    raise exception 'Suggestion not found or already reviewed';
  end if;

  update identity_match_suggestions
  set
    decision = 'kept_separate',
    reviewed_by = p_admin_id,
    reviewed_at = now()
  where id = p_suggestion_id;

  insert into identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata
  )
  values
  (
    v_suggestion.identity_a,
    'match_reviewed',
    'Identity kept separate',
    'Admin reviewed a possible duplicate and chose to keep identities separate.',
    jsonb_build_object(
      'other_identity_id', v_suggestion.identity_b,
      'reason', p_reason,
      'suggestion_id', p_suggestion_id
    )
  ),
  (
    v_suggestion.identity_b,
    'match_reviewed',
    'Identity kept separate',
    'Admin reviewed a possible duplicate and chose to keep identities separate.',
    jsonb_build_object(
      'other_identity_id', v_suggestion.identity_a,
      'reason', p_reason,
      'suggestion_id', p_suggestion_id
    )
  );
end;
$$;


ALTER FUNCTION "public"."keep_identities_separate"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_crm_communication"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_channel" "text", "p_direction" "text", "p_subject" "text", "p_message" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_comm_id uuid;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can log communication';
  end if;

  insert into crm_communications (
    identity_id,
    lead_id,
    channel,
    direction,
    subject,
    message,
    handled_by
  )
  values (
    p_identity_id,
    p_lead_id,
    p_channel,
    coalesce(p_direction, 'outbound'),
    p_subject,
    p_message,
    p_admin_id
  )
  returning id into v_comm_id;

  insert into identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata
  )
  values (
    p_identity_id,
    'communication_logged',
    'Communication logged',
    'A customer communication was recorded.',
    jsonb_build_object(
      'communication_id', v_comm_id,
      'lead_id', p_lead_id,
      'channel', p_channel,
      'direction', p_direction,
      'subject', p_subject
    )
  );

  return v_comm_id;
end;
$$;


ALTER FUNCTION "public"."log_crm_communication"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_channel" "text", "p_direction" "text", "p_subject" "text", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_crm_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update crm_notifications
  set
    status = 'read',
    read_at = now()
  where id = p_notification_id
  and (
    created_for is null
    or created_for = p_user_id
  );
end;
$$;


ALTER FUNCTION "public"."mark_crm_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_invoice_sent"("p_admin_id" "uuid", "p_invoice_id" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sale record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can mark invoices sent';
  end if;

  select s.*
  into v_sale
  from crm_invoices i
  join crm_sales s on s.id = i.sale_id
  where i.id = p_invoice_id;

  update crm_invoices
  set
    status = 'sent',
    sent_to_email = p_email,
    sent_at = now()
  where id = p_invoice_id;

  if v_sale.identity_id is not null then
    insert into identity_events (
      identity_id, event_type, title, description, metadata
    )
    values (
      v_sale.identity_id,
      'invoice_sent',
      'Invoice sent',
      'An invoice was sent to the customer.',
      jsonb_build_object(
        'invoice_id', p_invoice_id,
        'sale_id', v_sale.id,
        'email', p_email
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."mark_invoice_sent"("p_admin_id" "uuid", "p_invoice_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_receipt_sent"("p_admin_id" "uuid", "p_receipt_id" "uuid", "p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sale record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can mark receipts sent';
  end if;

  select s.*
  into v_sale
  from crm_receipts r
  join crm_sales s on s.id = r.sale_id
  where r.id = p_receipt_id;

  update crm_receipts
  set
    sent_to_email = p_email,
    sent_at = now()
  where id = p_receipt_id;

  if v_sale.identity_id is not null then
    insert into identity_events (
      identity_id, event_type, title, description, metadata
    )
    values (
      v_sale.identity_id,
      'receipt_sent',
      'Receipt sent',
      'A receipt was sent to the customer.',
      jsonb_build_object(
        'receipt_id', p_receipt_id,
        'sale_id', v_sale.id,
        'email', p_email
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."mark_receipt_sent"("p_admin_id" "uuid", "p_receipt_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_identities"("p_admin_id" "uuid", "p_primary_identity_id" "uuid", "p_duplicate_identity_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_primary_identity_id = p_duplicate_identity_id then
    raise exception 'Cannot merge the same identity';
  end if;

  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can merge identities';
  end if;

  if not exists (select 1 from identities where id = p_primary_identity_id) then
    raise exception 'Primary identity not found';
  end if;

  if not exists (select 1 from identities where id = p_duplicate_identity_id) then
    raise exception 'Duplicate identity not found';
  end if;

  -- Move signals
  insert into identity_signals (
    identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified,
    first_seen_at,
    last_seen_at,
    seen_count,
    source
  )
  select
    p_primary_identity_id,
    signal_type,
    signal_value,
    confidence_weight,
    verified,
    first_seen_at,
    last_seen_at,
    seen_count,
    source
  from identity_signals
  where identity_id = p_duplicate_identity_id
  on conflict (identity_id, signal_type, signal_value)
  do update set
    seen_count = identity_signals.seen_count + excluded.seen_count,
    last_seen_at = greatest(identity_signals.last_seen_at, excluded.last_seen_at),
    confidence_weight = greatest(identity_signals.confidence_weight, excluded.confidence_weight),
    verified = identity_signals.verified or excluded.verified;

  -- Move identity events
  update identity_events
  set identity_id = p_primary_identity_id
  where identity_id = p_duplicate_identity_id;

  -- Move leads
  update leads
  set identity_id = p_primary_identity_id,
      updated_at = now()
  where identity_id = p_duplicate_identity_id;

  -- Move referral clicks
  update referral_clicks
  set identity_id = p_primary_identity_id
  where identity_id = p_duplicate_identity_id;

  -- Mark suggestions resolved
  update identity_match_suggestions
  set
    decision = 'merged',
    reviewed_by = p_admin_id,
    reviewed_at = now()
  where
    (identity_a = p_primary_identity_id and identity_b = p_duplicate_identity_id)
    or
    (identity_a = p_duplicate_identity_id and identity_b = p_primary_identity_id);

  -- Record merge event
  insert into identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata
  )
  values (
    p_primary_identity_id,
    'identity_merged',
    'Identity merged',
    'A duplicate identity was merged into this primary identity.',
    jsonb_build_object(
      'primary_identity_id', p_primary_identity_id,
      'duplicate_identity_id', p_duplicate_identity_id,
      'reason', p_reason,
      'merged_by', p_admin_id
    )
  );

  -- Keep duplicate as archived instead of deleting
  update identities
  set
    status = 'merged',
    updated_at = now()
  where id = p_duplicate_identity_id;

  -- Improve primary identity updated time
  update identities
  set updated_at = now()
  where id = p_primary_identity_id;
end;
$$;


ALTER FUNCTION "public"."merge_identities"("p_admin_id" "uuid", "p_primary_identity_id" "uuid", "p_duplicate_identity_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_lead_funnel_stage"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_new_stage" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old_stage text;
  v_identity_id uuid;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can move funnel stages';
  end if;

  if not exists (
    select 1 from crm_funnel_stages
    where stage_key = p_new_stage
    and is_active = true
  ) then
    raise exception 'Invalid funnel stage';
  end if;

  select funnel_stage, identity_id
  into v_old_stage, v_identity_id
  from leads
  where id = p_lead_id;

  if v_old_stage is null then
    v_old_stage := 'new_lead';
  end if;

  update leads
  set
    funnel_stage = p_new_stage,
    updated_at = now()
  where id = p_lead_id;

  insert into crm_funnel_events (
    lead_id,
    identity_id,
    old_stage,
    new_stage,
    changed_by,
    note
  )
  values (
    p_lead_id,
    v_identity_id,
    v_old_stage,
    p_new_stage,
    p_admin_id,
    p_note
  );

  if v_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_identity_id,
      'funnel_stage_changed',
      'Funnel stage changed',
      'Lead was moved from one CRM funnel stage to another.',
      jsonb_build_object(
        'lead_id', p_lead_id,
        'old_stage', v_old_stage,
        'new_stage', p_new_stage,
        'note', p_note
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."move_lead_funnel_stage"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_new_stage" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_ng_phone"("raw_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g');

  if digits = '' then
    return null;
  end if;

  if left(digits, 4) = '2340' and length(digits) >= 14 then
    digits := '234' || substring(digits from 5);
  elsif left(digits, 1) = '0' and length(digits) = 11 then
    digits := '234' || substring(digits from 2);
  elsif length(digits) = 10 and left(digits, 1) in ('7','8','9') then
    digits := '234' || digits;
  end if;

  if left(digits, 3) <> '234' or length(digits) <> 13 then
    return null;
  end if;

  return digits;
end;
$$;


ALTER FUNCTION "public"."normalize_ng_phone"("raw_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_sms_campaign_recipients"("p_campaign_id" "uuid", "p_limit" integer DEFAULT 20) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inserted_count integer := 0;
begin
  insert into public.sms_campaign_recipients (campaign_id, lead_id)
  select p_campaign_id, lead.id
  from public.sms_leads lead
  where lead.whatsapp_outreach_status = 'not_messaged'
    and not exists (
      select 1
      from public.sms_campaign_recipients existing
      where existing.campaign_id = p_campaign_id
        and existing.lead_id = lead.id
    )
  order by lead.joined_at asc nulls last, lead.created_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 5000))
  on conflict (campaign_id, lead_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."prepare_sms_campaign_recipients"("p_campaign_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_payout"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_points_paid" integer, "p_amount" numeric, "p_notes" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payout_id uuid;
  v_current_balance numeric;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can process payouts';
  end if;

  select coalesce(available_balance, 0)
  into v_current_balance
  from ambassadors
  where id = p_ambassador_id;

  if v_current_balance < p_amount then
    raise exception 'Insufficient ambassador balance';
  end if;

  insert into payouts (
    ambassador_id,
    amount,
    points_paid,
    status,
    notes,
    paid_by,
    paid_at,
    created_at
  )
  values (
    p_ambassador_id,
    p_amount,
    coalesce(p_points_paid, 0),
    'paid',
    p_notes,
    p_admin_id,
    now(),
    now()
  )
  returning id into v_payout_id;

  update ambassadors
  set
    available_balance = coalesce(available_balance, 0) - p_amount,
    total_cashed_out = coalesce(total_cashed_out, 0) + p_amount
  where id = p_ambassador_id;

  return v_payout_id;
end;
$$;


ALTER FUNCTION "public"."process_payout"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_points_paid" integer, "p_amount" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_spin_cash_challenge"("p_spin_player_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_player public.spin_players%rowtype;
  v_challenge public.spin_cash_challenges%rowtype;
  v_conversion numeric(14,2) := 0;
  v_cash_result jsonb;
begin
  select * into v_player
  from public.spin_players
  where id = p_spin_player_id
  for update;

  if not found then
    raise exception 'Spin player not found' using errcode = 'P0002';
  end if;

  select * into v_challenge
  from public.spin_cash_challenges c
  where c.spin_player_id = p_spin_player_id
    and c.status = 'active'
  order by c.created_at desc
  limit 1
  for update;

  if not found or v_challenge.expires_at > now() then
    return public.spin_cash_challenge_payload(p_spin_player_id);
  end if;

  if v_challenge.cash_balance >= v_challenge.cash_target then
    update public.spin_cash_challenges
    set status = 'cash_eligible',
        processed_at = now(),
        updated_at = now()
    where id = v_challenge.id;

    update public.spin_players
    set wallet_balance = v_challenge.cash_balance,
        cashout_eligible = true,
        updated_at = now()
    where id = p_spin_player_id;

    insert into public.identity_events (
      identity_id, event_type, title, description, metadata, created_at
    ) values (
      v_player.identity_id,
      'cash_challenge_cash_eligible',
      '24-hour cash challenge completed',
      format('Cash withdrawal eligibility unlocked at %s.', v_challenge.cash_balance),
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'cash_balance', v_challenge.cash_balance,
        'cash_target', v_challenge.cash_target,
        'cash_cap', v_challenge.cash_cap
      ),
      now()
    );
  else
    v_conversion := case
      when v_challenge.cash_balance <= 0 then 0
      when v_challenge.cash_balance < v_challenge.conversion_floor
        then v_challenge.cash_balance
      when v_challenge.cash_balance < v_challenge.cash_target
        then v_challenge.cash_target
      else 0
    end;

    if v_conversion > 0 then
      v_cash_result := public.credit_cash_off(
        p_identity_id => v_player.identity_id,
        p_amount => v_conversion,
        p_transaction_type => 'promotion',
        p_source_system => 'spin_cash_challenge',
        p_source_reference => v_challenge.id::text,
        p_reason => format(
          '24-hour cash challenge converted %s cash into %s Cash-Off.',
          trim(to_char(v_challenge.cash_balance, 'FM999999999990.00')),
          trim(to_char(v_conversion, 'FM999999999990.00'))
        ),
        p_metadata => jsonb_build_object(
          'challenge_id', v_challenge.id,
          'cash_balance', v_challenge.cash_balance,
          'conversion_floor', v_challenge.conversion_floor,
          'cash_target', v_challenge.cash_target
        ),
        p_idempotency_key => 'cash-challenge-expiry:' || v_challenge.id::text
      );
    end if;

    update public.spin_cash_challenges
    set status = 'converted_to_cash_off',
        converted_cash_off_amount = v_conversion,
        processed_at = now(),
        updated_at = now()
    where id = v_challenge.id;

    update public.spin_players
    set wallet_balance = 0,
        cashout_eligible = false,
        total_cash_off_won = coalesce(total_cash_off_won, 0) + v_conversion,
        updated_at = now()
    where id = p_spin_player_id;

    insert into public.identity_events (
      identity_id, event_type, title, description, metadata, created_at
    ) values (
      v_player.identity_id,
      'cash_challenge_converted_to_cash_off',
      '24-hour cash challenge converted',
      format('%s cash converted to %s Cash-Off.', v_challenge.cash_balance, v_conversion),
      jsonb_build_object(
        'challenge_id', v_challenge.id,
        'cash_balance', v_challenge.cash_balance,
        'cash_off_amount', v_conversion,
        'cash_off_transaction_id', v_cash_result->>'transaction_id'
      ),
      now()
    );
  end if;

  return public.spin_cash_challenge_payload(p_spin_player_id);
end;
$$;


ALTER FUNCTION "public"."process_spin_cash_challenge"("p_spin_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_product_interest"("p_identity_id" "uuid", "p_lead_id" "uuid", "p_product_id" "uuid", "p_interest_type" "text" DEFAULT 'like'::"text", "p_source" "text" DEFAULT 'website'::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_interest_id uuid;
begin
  insert into product_interests (
    identity_id,
    lead_id,
    product_id,
    interest_type,
    source,
    note
  )
  values (
    p_identity_id,
    p_lead_id,
    p_product_id,
    coalesce(p_interest_type, 'like'),
    coalesce(p_source, 'website'),
    p_note
  )
  returning id into v_interest_id;

  if p_identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      p_identity_id,
      'product_interest',
      'Product interest recorded',
      'Customer showed interest in a product.',
      jsonb_build_object(
        'interest_id', v_interest_id,
        'lead_id', p_lead_id,
        'product_id', p_product_id,
        'interest_type', p_interest_type,
        'source', p_source,
        'note', p_note
      )
    );
  end if;

  return v_interest_id;
end;
$$;


ALTER FUNCTION "public"."record_product_interest"("p_identity_id" "uuid", "p_lead_id" "uuid", "p_product_id" "uuid", "p_interest_type" "text", "p_source" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_sms_campaign_click"("p_tracking_token" "text") RETURNS TABLE("whatsapp_number" "text", "whatsapp_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.sms_campaign_recipients recipient
  set
    clicked_at = coalesce(recipient.clicked_at, now()),
    click_count = recipient.click_count + 1,
    sms_status = case
      when recipient.sms_status = 'claimed' then 'claimed'
      else 'clicked'
    end
  where recipient.tracking_token = p_tracking_token;

  return query
  select campaign.whatsapp_number, campaign.whatsapp_message
  from public.sms_campaign_recipients recipient
  join public.sms_campaigns campaign on campaign.id = recipient.campaign_id
  where recipient.tracking_token = p_tracking_token
  limit 1;
end;
$$;


ALTER FUNCTION "public"."record_sms_campaign_click"("p_tracking_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_sms_leads_from_spin_players"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  affected integer := 0;
begin
  insert into public.sms_leads (
    source_player_id,
    first_name,
    full_name,
    phone_normalized,
    joined_at
  )
  select
    coalesce(j->>'id', j->>'identity_id', j->>'player_id', md5(coalesce(j->>'phone_number', j->>'phone', j->>'whatsapp_number', j->>'identity_value', ''))) as source_player_id,
    coalesce(
      nullif(j->>'first_name', ''),
      nullif(split_part(coalesce(j->>'full_name', j->>'name', ''), ' ', 1), ''),
      'Hi'
    ) as first_name,
    coalesce(nullif(j->>'full_name', ''), nullif(j->>'name', ''), nullif(j->>'first_name', ''), 'Unnamed lead') as full_name,
    public.normalize_ng_phone(coalesce(j->>'phone_number', j->>'phone', j->>'whatsapp_number', j->>'identity_value', j->>'mobile')) as phone_normalized,
    case
      when coalesce(j->>'created_at', j->>'joined_at', '') ~ '^\d{4}-\d{2}-\d{2}'
        then coalesce(j->>'created_at', j->>'joined_at')::timestamptz
      else null
    end as joined_at
  from (
    select to_jsonb(p) as j
    from public.spin_players p
  ) source
  where public.normalize_ng_phone(coalesce(j->>'phone_number', j->>'phone', j->>'whatsapp_number', j->>'identity_value', j->>'mobile')) is not null
  on conflict (phone_normalized) do update
  set
    source_player_id = excluded.source_player_id,
    first_name = excluded.first_name,
    full_name = excluded.full_name,
    joined_at = coalesce(excluded.joined_at, public.sms_leads.joined_at);

  get diagnostics affected = row_count;
  return affected;
end;
$$;


ALTER FUNCTION "public"."refresh_sms_leads_from_spin_players"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_visitor_session"("p_visitor_id" "text", "p_referral_code" "text" DEFAULT NULL::"text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ambassador_id uuid;
begin
  if p_referral_code is not null then
    select id
    into v_ambassador_id
    from public.ambassadors
    where status = 'active'
    and (
      lower(referral_code) = lower(p_referral_code)
      or lower(custom_referral_code) = lower(p_referral_code)
    )
    limit 1;
  end if;

  insert into public.visitor_sessions (
    visitor_id,
    ambassador_id,
    referral_code,
    ip_address,
    user_agent,
    first_seen,
    last_seen
  )
  values (
    p_visitor_id,
    v_ambassador_id,
    p_referral_code,
    p_ip_address,
    p_user_agent,
    now(),
    now()
  )
  on conflict (visitor_id) do update
  set
    ambassador_id = coalesce(visitor_sessions.ambassador_id, excluded.ambassador_id),
    referral_code = coalesce(visitor_sessions.referral_code, excluded.referral_code),
    ip_address = excluded.ip_address,
    user_agent = excluded.user_agent,
    last_seen = now();

  return jsonb_build_object(
    'success', true,
    'visitor_id', p_visitor_id,
    'ambassador_id', v_ambassador_id
  );
end;
$$;


ALTER FUNCTION "public"."register_visitor_session"("p_visitor_id" "text", "p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can reject lead edits';
  end if;

  select * into v_lead
  from leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  update leads
  set
    pending_customer_name = null,
    pending_customer_phone = null,
    edit_status = 'rejected',
    updated_at = now()
  where id = p_lead_id;

  insert into lead_events (
    lead_id, ambassador_id, event_type, event_title, event_description, event_data, created_by
  )
  values (
    p_lead_id,
    v_lead.ambassador_id,
    'edit_rejected',
    'Lead update rejected',
    'Admin rejected ambassador requested lead update.',
    jsonb_build_object(
      'rejected_name', v_lead.pending_customer_name,
      'rejected_phone', v_lead.pending_customer_phone
    ),
    p_admin_id
  );
end;
$$;


ALTER FUNCTION "public"."reject_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead record;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can reject leads';
  end if;

  select *
  into v_lead
  from leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  if v_lead.approved_as_lead = true then
    raise exception 'Approved leads cannot be rejected. Reverse approval separately if needed.';
  end if;

  update leads
  set
    lead_approval_status = 'rejected',
    approved_as_lead = false,
    updated_at = now()
  where id = p_lead_id;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by
  )
  values (
    p_lead_id,
    v_lead.ambassador_id,
    'lead_rejected',
    'Lead rejected',
    'This referral was reviewed and rejected as a valid ambassador lead.',
    jsonb_build_object(
      'reason', p_reason,
      'rejected_at', now(),
      'rejected_by', p_admin_id
    ),
    p_admin_id
  );

  if v_lead.identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_lead.identity_id,
      'lead_rejected',
      'Lead rejected',
      'A linked referral lead was rejected and not counted for the ambassador.',
      jsonb_build_object(
        'lead_id', p_lead_id,
        'ambassador_id', v_lead.ambassador_id,
        'reason', p_reason,
        'rejected_by', p_admin_id
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."reject_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_ambassador_on_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.role = 'admin' AND OLD.role != 'admin' THEN
        DELETE FROM ambassadors WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."remove_ambassador_on_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_lead_edit"("p_lead_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update leads
  set
    pending_customer_name = p_customer_name,
    pending_customer_phone = p_customer_phone,
    edit_status = 'pending',
    updated_at = now()
  where id = p_lead_id
  and ambassador_id = p_ambassador_id;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data
  )
  values (
    p_lead_id,
    p_ambassador_id,
    'edit_requested',
    'Lead edit requested',
    'Ambassador requested to update lead name and phone number.',
    jsonb_build_object(
      'pending_customer_name', p_customer_name,
      'pending_customer_phone', p_customer_phone
    )
  );
end;
$$;


ALTER FUNCTION "public"."request_lead_edit"("p_lead_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_conversion_no_commission"("p_admin_id" "uuid", "p_conversion_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conversion record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can resolve conversion reviews';
  end if;

  select * into v_conversion
  from conversions
  where id = p_conversion_id
  for update;

  if v_conversion.id is null then
    raise exception 'Conversion not found';
  end if;

  update conversions
  set
    admin_attention_required = false,
    internal_note = coalesce(internal_note, '') || ' | Reviewed: no commission approved.',
    approved_by = p_admin_id
  where id = p_conversion_id;

  update admin_notifications
  set is_read = true
  where related_table = 'conversions'
  and related_id = p_conversion_id;

  insert into lead_events (
    lead_id,
    ambassador_id,
    event_type,
    event_title,
    event_description,
    event_data,
    created_by
  )
  values (
    v_conversion.lead_id,
    v_conversion.ambassador_id,
    'conversion_review_resolved',
    'Conversion review resolved',
    'Admin approved this repeat conversion with no ambassador commission.',
    jsonb_build_object('conversion_id', p_conversion_id),
    p_admin_id
  );
end;
$$;


ALTER FUNCTION "public"."resolve_conversion_no_commission"("p_admin_id" "uuid", "p_conversion_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_identity_ambassador_conflict"("p_admin_id" "uuid", "p_conflict_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conflict record;
begin
  if not exists (
    select 1 from users
    where id = p_admin_id
    and role = 'admin'
  ) then
    raise exception 'Only admins can resolve ambassador conflicts';
  end if;

  select *
  into v_conflict
  from identity_ambassador_conflicts
  where id = p_conflict_id
  and decision = 'pending'
  for update;

  if v_conflict.id is null then
    raise exception 'Conflict not found or already reviewed';
  end if;

  if p_decision not in ('keep_original', 'transfer', 'split_commission', 'ignore') then
    raise exception 'Invalid decision';
  end if;

  update identity_ambassador_conflicts
  set
    decision = p_decision,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  where id = p_conflict_id;

  insert into identity_events (
    identity_id,
    event_type,
    title,
    description,
    metadata
  )
  values (
    v_conflict.identity_id,
    'ambassador_conflict_resolved',
    'Ambassador conflict resolved',
    'Admin reviewed an ambassador ownership conflict.',
    jsonb_build_object(
      'conflict_id', p_conflict_id,
      'decision', p_decision,
      'original_ambassador_id', v_conflict.original_ambassador_id,
      'new_ambassador_id', v_conflict.new_ambassador_id,
      'note', p_note,
      'reviewed_by', p_admin_id
    )
  );
end;
$$;


ALTER FUNCTION "public"."resolve_identity_ambassador_conflict"("p_admin_id" "uuid", "p_conflict_id" "uuid", "p_decision" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_crm_identities"("p_query" "text") RETURNS TABLE("identity_id" "uuid", "identity_code" "text", "primary_name" "text", "primary_phone" "text", "primary_email" "text", "matched_signal_type" "text", "matched_signal_value" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select distinct on (i.id)
    i.id,
    i.identity_code,
    i.primary_name,
    i.primary_phone,
    i.primary_email,
    s.signal_type,
    s.signal_value
  from identities i
  left join identity_signals s on s.identity_id = i.id
  where i.status = 'active'
  and (
    lower(i.identity_code) like '%' || lower(p_query) || '%'
    or lower(coalesce(i.primary_name, '')) like '%' || lower(p_query) || '%'
    or lower(coalesce(i.primary_phone, '')) like '%' || lower(p_query) || '%'
    or lower(coalesce(i.primary_email, '')) like '%' || lower(p_query) || '%'
    or lower(coalesce(s.signal_value, '')) like '%' || lower(p_query) || '%'
  )
  order by i.id, i.updated_at desc
  limit 50;
$$;


ALTER FUNCTION "public"."search_crm_identities"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_custom_referral_code"("p_ambassador_id" "uuid", "p_code" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_already_set BOOLEAN;
BEGIN
  SELECT custom_referral_code_set INTO v_already_set
  FROM ambassadors WHERE id = p_ambassador_id;

  IF v_already_set THEN
    RETURN false;
  END IF;

  UPDATE ambassadors 
  SET custom_referral_code = p_code,
      custom_referral_code_set = true
  WHERE id = p_ambassador_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."set_custom_referral_code"("p_ambassador_id" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sms_dashboard_summary"("p_campaign_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("total_leads" bigint, "eligible_leads" bigint, "selected_recipients" bigint, "clicked_recipients" bigint, "claimed_recipients" bigint, "sent_recipients" bigint, "success_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select count(*) from public.sms_leads) as total_leads,
    (select count(*) from public.sms_leads where whatsapp_outreach_status = 'not_messaged') as eligible_leads,
    (select count(*) from public.sms_campaign_recipients r where p_campaign_id is null or r.campaign_id = p_campaign_id) as selected_recipients,
    (select count(*) from public.sms_campaign_recipients r where (p_campaign_id is null or r.campaign_id = p_campaign_id) and r.clicked_at is not null) as clicked_recipients,
    (select count(*) from public.sms_campaign_recipients r where (p_campaign_id is null or r.campaign_id = p_campaign_id) and r.whatsapp_claimed_at is not null) as claimed_recipients,
    (select count(*) from public.sms_campaign_recipients r where (p_campaign_id is null or r.campaign_id = p_campaign_id) and r.sms_status in ('sent','delivered','clicked','claimed')) as sent_recipients,
    case
      when (select count(*) from public.sms_campaign_recipients r where (p_campaign_id is null or r.campaign_id = p_campaign_id) and r.sms_status in ('sent','delivered','clicked','claimed')) = 0 then 0
      else round(
        100.0 *
        (select count(*) from public.sms_campaign_recipients r where (p_campaign_id is null or r.campaign_id = p_campaign_id) and r.whatsapp_claimed_at is not null)
        /
        (select count(*) from public.sms_campaign_recipients r where (p_campaign_id is null or r.campaign_id = p_campaign_id) and r.sms_status in ('sent','delivered','clicked','claimed')),
        1
      )
    end as success_rate;
$$;


ALTER FUNCTION "public"."sms_dashboard_summary"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sms_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."sms_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spin_cash_challenge_payload"("p_spin_player_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_challenge public.spin_cash_challenges%rowtype;
  v_seconds bigint := 0;
begin
  select * into v_challenge
  from public.spin_cash_challenges c
  where c.spin_player_id = p_spin_player_id
  order by
    case c.status when 'active' then 0 when 'cash_eligible' then 1 else 2 end,
    c.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_started',
      'cash_balance', 0,
      'cash_target', 1000,
      'cash_cap', 3000,
      'conversion_floor', 700,
      'seconds_remaining', 0,
      'active', false,
      'expired', false,
      'cash_eligible', false,
      'converted_to_cash_off', false,
      'converted_cash_off_amount', 0
    );
  end if;

  if v_challenge.status = 'active' then
    v_seconds := greatest(
      0,
      floor(extract(epoch from (v_challenge.expires_at - now())))::bigint
    );
  end if;

  return jsonb_build_object(
    'id', v_challenge.id,
    'cycle_number', v_challenge.cycle_number,
    'status', v_challenge.status,
    'started_at', v_challenge.started_at,
    'expires_at', v_challenge.expires_at,
    'processed_at', v_challenge.processed_at,
    'cash_balance', v_challenge.cash_balance,
    'cash_target', v_challenge.cash_target,
    'cash_cap', v_challenge.cash_cap,
    'conversion_floor', v_challenge.conversion_floor,
    'seconds_remaining', v_seconds,
    'active', v_challenge.status = 'active',
    'expired', v_challenge.status <> 'active' or v_challenge.expires_at <= now(),
    'cash_eligible', v_challenge.status = 'cash_eligible',
    'converted_to_cash_off', v_challenge.status = 'converted_to_cash_off',
    'converted_cash_off_amount', v_challenge.converted_cash_off_amount,
    'progress_percent', least(
      100,
      round((v_challenge.cash_balance / nullif(v_challenge.cash_target, 0)) * 100)
    ),
    'amount_to_cash_target', greatest(0, v_challenge.cash_target - v_challenge.cash_balance),
    'amount_to_cap', greatest(0, v_challenge.cash_cap - v_challenge.cash_balance)
  );
end;
$$;


ALTER FUNCTION "public"."spin_cash_challenge_payload"("p_spin_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_all_spin_wallets_to_cash_off"("p_source_system" "text" DEFAULT 'legacy_spin_wallet'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_player record;
    v_result jsonb;
    v_processed integer := 0;
    v_changed integer := 0;
    v_credited numeric(14,2) := 0;
    v_reversed numeric(14,2) := 0;
    v_delta numeric(14,2);
begin
    for v_player in
        select sp.id
        from public.spin_players sp
        where sp.identity_id is not null
        order by sp.created_at nulls first, sp.id
    loop
        v_result := public.sync_spin_player_wallet_to_cash_off(
            v_player.id,
            p_source_system
        );

        v_processed := v_processed + 1;
        v_delta := coalesce(
            (v_result ->> 'delta_applied')::numeric,
            0
        );

        if v_delta <> 0 then
            v_changed := v_changed + 1;
        end if;

        if v_delta > 0 then
            v_credited := v_credited + v_delta;
        elsif v_delta < 0 then
            v_reversed := v_reversed + abs(v_delta);
        end if;
    end loop;

    return jsonb_build_object(
        'source_system', p_source_system,
        'players_processed', v_processed,
        'players_changed', v_changed,
        'cash_off_credited', v_credited,
        'cash_off_reversed', v_reversed,
        'legacy_wallet_total',
            (
                select coalesce(sum(greatest(coalesce(wallet_balance, 0), 0)), 0)
                from public.spin_players
                where identity_id is not null
            ),
        'source_balance_total',
            (
                select coalesce(sum(imported_balance), 0)
                from public.cash_off_source_balances
                where source_system = p_source_system
            )
    );
end;
$$;


ALTER FUNCTION "public"."sync_all_spin_wallets_to_cash_off"("p_source_system" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_spin_player_wallet_to_cash_off"("p_spin_player_id" "uuid", "p_source_system" "text" DEFAULT 'legacy_spin_wallet'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_player public.spin_players%rowtype;
    v_source_key text;
    v_previous numeric(14,2);
    v_desired numeric(14,2);
    v_delta numeric(14,2);
    v_version integer;
    v_transaction jsonb;
begin
    select *
    into v_player
    from public.spin_players sp
    where sp.id = p_spin_player_id
    for update;

    if not found then
        raise exception 'Spin player not found'
            using errcode = 'P0002';
    end if;

    if v_player.identity_id is null then
        raise exception 'Spin player has no identity'
            using errcode = 'P0001';
    end if;

    v_source_key := coalesce(
        v_player.old_spin_profile_id::text,
        v_player.id::text
    );

    v_desired := round(
        greatest(coalesce(v_player.wallet_balance, 0), 0)::numeric,
        2
    );

    insert into public.cash_off_source_balances (
        source_system,
        source_account_key,
        identity_id,
        imported_balance,
        sync_version,
        source_updated_at,
        metadata
    )
    values (
        p_source_system,
        v_source_key,
        v_player.identity_id,
        0,
        0,
        v_player.updated_at,
        jsonb_build_object(
            'spin_player_id', v_player.id,
            'old_spin_profile_id', v_player.old_spin_profile_id
        )
    )
    on conflict (source_system, source_account_key) do nothing;

    select s.imported_balance, s.sync_version
    into v_previous, v_version
    from public.cash_off_source_balances s
    where s.source_system = p_source_system
      and s.source_account_key = v_source_key
    for update;

    if not exists (
        select 1
        from public.cash_off_source_balances s
        where s.source_system = p_source_system
          and s.source_account_key = v_source_key
          and s.identity_id = v_player.identity_id
    ) then
        raise exception 'Legacy source identity mismatch'
            using errcode = 'P0001';
    end if;

    v_delta := v_desired - v_previous;
    v_version := v_version + 1;

    if v_delta > 0 then
        v_transaction := public.cash_off_apply_transaction(
            v_player.identity_id,
            'credit',
            v_delta,
            'legacy_spin_migration',
            p_source_system,
            v_source_key,
            null,
            null,
            null,
            'Legacy Spin & Win wallet converted to Cash Off.',
            jsonb_build_object(
                'spin_player_id', v_player.id,
                'old_spin_profile_id', v_player.old_spin_profile_id,
                'legacy_wallet_balance', v_desired,
                'previously_imported', v_previous,
                'sync_version', v_version
            ),
            format(
                'legacy-wallet:%s:%s:v%s',
                p_source_system,
                v_source_key,
                v_version
            )
        );
    elsif v_delta < 0 then
        v_transaction := public.cash_off_apply_transaction(
            v_player.identity_id,
            'debit',
            abs(v_delta),
            'legacy_spin_migration_reversal',
            p_source_system,
            v_source_key,
            null,
            null,
            null,
            'Legacy Spin & Win wallet reconciliation.',
            jsonb_build_object(
                'spin_player_id', v_player.id,
                'old_spin_profile_id', v_player.old_spin_profile_id,
                'legacy_wallet_balance', v_desired,
                'previously_imported', v_previous,
                'sync_version', v_version
            ),
            format(
                'legacy-wallet:%s:%s:v%s',
                p_source_system,
                v_source_key,
                v_version
            )
        );
    else
        v_transaction := jsonb_build_object(
            'applied', false,
            'reason', 'already_in_sync',
            'balance_after',
                coalesce(
                    (
                        select a.balance
                        from public.cash_off_accounts a
                        where a.identity_id = v_player.identity_id
                    ),
                    0
                )
        );
    end if;

    update public.cash_off_source_balances
    set
        identity_id = v_player.identity_id,
        imported_balance = v_desired,
        sync_version = v_version,
        source_updated_at = v_player.updated_at,
        last_synced_at = now(),
        metadata = jsonb_build_object(
            'spin_player_id', v_player.id,
            'old_spin_profile_id', v_player.old_spin_profile_id,
            'legacy_wallet_balance', v_desired
        )
    where source_system = p_source_system
      and source_account_key = v_source_key;

    return jsonb_build_object(
        'spin_player_id', v_player.id,
        'identity_id', v_player.identity_id,
        'source_system', p_source_system,
        'source_account_key', v_source_key,
        'previously_imported', v_previous,
        'legacy_wallet_balance', v_desired,
        'delta_applied', v_delta,
        'sync_version', v_version,
        'transaction', v_transaction
    );
end;
$$;


ALTER FUNCTION "public"."sync_spin_player_wallet_to_cash_off"("p_spin_player_id" "uuid", "p_source_system" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_cash_off_account_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    new.updated_at := now();
    return new;
end;
$$;


ALTER FUNCTION "public"."touch_cash_off_account_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_product_event"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer DEFAULT 1, "p_source_page" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_session record;
begin
  if p_event_type not in (
    'cash_off_product_selected','cash_off_product_changed','cash_off_product_removed',
    'full_wheel_opened_from_overlay','full_wheel_opened_from_cart','returned_from_full_wheel'
  ) then
    return public.track_product_event_legacy(p_visitor_id, p_product_id, p_event_type, p_quantity, p_source_page);
  end if;
  if nullif(trim(p_visitor_id), '') is null then raise exception 'visitor_id is required' using errcode = '22023'; end if;
  if p_event_type like 'cash_off_product_%' and p_product_id is null then raise exception 'product_id is required' using errcode = '22023'; end if;
  select * into v_session from public.visitor_sessions where visitor_id = trim(p_visitor_id) limit 1;
  if not found then raise exception 'Visitor session is not registered' using errcode = '23503'; end if;
  insert into public.website_events(visitor_id, product_id, ambassador_id, event_type, quantity, source_page)
  values (trim(p_visitor_id), p_product_id, v_session.ambassador_id, p_event_type, greatest(coalesce(p_quantity, 1), 1), left(p_source_page, 500));
  update public.visitor_sessions set last_seen = now() where visitor_id = trim(p_visitor_id);
  return jsonb_build_object('success', true, 'event_type', p_event_type);
end;
$$;


ALTER FUNCTION "public"."track_product_event"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_product_event_legacy"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer DEFAULT 1, "p_source_page" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session record;
  v_lead_id uuid;
  v_event_type text;
begin
  if nullif(trim(p_visitor_id), '') is null then
    raise exception 'visitor_id is required' using errcode = '22023';
  end if;

  v_event_type := case p_event_type
    when 'view' then 'product_viewed'
    else p_event_type
  end;

  if v_event_type not in (
    'website_visited', 'page_viewed', 'product_viewed', 'product_quick_viewed',
    'product_shared', 'add_to_cart', 'remove_from_cart',
    'whatsapp_purchase_clicked', 'spin_opened_from_product', 'reward_viewed',
    'reward_applied'
  ) then
    raise exception 'Unsupported website event type: %', v_event_type using errcode = '22023';
  end if;

  if v_event_type in (
    'product_viewed', 'product_quick_viewed', 'product_shared', 'add_to_cart',
    'remove_from_cart', 'whatsapp_purchase_clicked', 'spin_opened_from_product'
  ) and p_product_id is null then
    raise exception 'product_id is required for %', v_event_type using errcode = '22023';
  end if;

  select * into v_session
  from public.visitor_sessions
  where visitor_id = p_visitor_id
  limit 1;

  if not found then
    raise exception 'Visitor session is not registered' using errcode = '23503';
  end if;

  insert into public.website_events (
    visitor_id, product_id, ambassador_id, event_type, quantity, source_page
  ) values (
    p_visitor_id, p_product_id, v_session.ambassador_id, v_event_type,
    greatest(coalesce(p_quantity, 1), 1), left(p_source_page, 500)
  );

  if v_event_type in ('product_viewed', 'product_quick_viewed') then
    insert into public.product_views (visitor_id, product_id, ambassador_id)
    values (p_visitor_id, p_product_id, v_session.ambassador_id);
  end if;

  if v_event_type = 'add_to_cart' then
    insert into public.cart_events (visitor_id, product_id, ambassador_id, quantity)
    values (p_visitor_id, p_product_id, v_session.ambassador_id, greatest(coalesce(p_quantity, 1), 1));

    insert into public.leads (
      ambassador_id, visitor_id, product_id, source, customer_name, customer_phone,
      customer_email, referral_code_used, status, lead_type, source_page, notes,
      created_at, updated_at
    ) values (
      v_session.ambassador_id, p_visitor_id, p_product_id, 'website_cart',
      'Anonymous Cart Lead', 'Pending - Website', null, v_session.referral_code,
      'new', 'add_to_cart', p_source_page,
      'Lead created automatically when visitor added product to cart.', now(), now()
    ) returning id into v_lead_id;
  end if;

  update public.visitor_sessions set last_seen = now() where visitor_id = p_visitor_id;

  return jsonb_build_object('success', true, 'event_type', v_event_type, 'lead_id', v_lead_id);
end;
$$;


ALTER FUNCTION "public"."track_product_event_legacy"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_whatsapp_referral_click"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ambassador_id uuid;
  v_existing_lead_id uuid;
  v_new_lead_id uuid;
  v_ip_signature text;
  v_device_signature text;
begin
  v_ip_signature := md5(coalesce(p_ip_address, 'unknown_ip'));
  v_device_signature := md5(coalesce(p_user_agent, 'unknown_device'));

  select id
  into v_ambassador_id
  from ambassadors
  where status = 'active'
  and (
    lower(referral_code) = lower(p_referral_code)
    or lower(custom_referral_code) = lower(p_referral_code)
  )
  limit 1;

  if v_ambassador_id is null then
    return;
  end if;

  insert into referral_clicks (
    ambassador_id,
    referral_code,
    source,
    ip_address,
    user_agent,
    created_at,
    counted_as_lead
  )
  values (
    v_ambassador_id,
    p_referral_code,
    'whatsapp',
    p_ip_address,
    p_user_agent,
    now(),
    false
  );

  select ls.lead_id
  into v_existing_lead_id
  from lead_signals ls
  where ls.ambassador_id = v_ambassador_id
  and (
    (ls.signal_type = 'ip_signature' and ls.signal_value = v_ip_signature)
    or
    (ls.signal_type = 'device_signature' and ls.signal_value = v_device_signature)
  )
  order by
    case
      when ls.signal_type = 'device_signature' then 1
      when ls.signal_type = 'ip_signature' then 2
      else 3
    end
  limit 1;

  if v_existing_lead_id is null then
    insert into leads (
      ambassador_id,
      source,
      customer_name,
      customer_phone,
      referral_code_used,
      status,
      ip_signature,
      device_signature,
      click_count,
      last_clicked_at,
      duplicate_status,
      confidence_score,
      created_at,
      updated_at
    )
    values (
      v_ambassador_id,
      'whatsapp',
      'WhatsApp Lead',
      'Not provided',
      p_referral_code,
      'new',
      v_ip_signature,
      v_device_signature,
      1,
      now(),
      'unique',
      0,
      now(),
      now()
    )
    returning id into v_new_lead_id;

    insert into lead_signals (
      lead_id,
      ambassador_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified
    )
    values
      (v_new_lead_id, v_ambassador_id, 'ip_signature', v_ip_signature, 20, false),
      (v_new_lead_id, v_ambassador_id, 'device_signature', v_device_signature, 25, false)
    on conflict (lead_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = lead_signals.seen_count + 1;

    insert into lead_events (
      lead_id,
      ambassador_id,
      event_type,
      event_title,
      event_description,
      event_data
    )
    values (
      v_new_lead_id,
      v_ambassador_id,
      'lead_created',
      'Lead created from referral click',
      'A new WhatsApp referral lead was created from the ambassador referral link.',
      jsonb_build_object(
        'referral_code', p_referral_code,
        'ip_address', p_ip_address,
        'user_agent', p_user_agent,
        'ip_signature', v_ip_signature,
        'device_signature', v_device_signature
      )
    );

    update referral_clicks
    set counted_as_lead = true
    where id = (
      select id
      from referral_clicks
      where ambassador_id = v_ambassador_id
      and referral_code = p_referral_code
      order by created_at desc
      limit 1
    );

    update ambassadors
    set
      total_leads = coalesce(total_leads, 0) + 1,
      total_points = coalesce(total_points, 0) + 100
    where id = v_ambassador_id;
  else
    update leads
    set
      click_count = coalesce(click_count, 1) + 1,
      last_clicked_at = now(),
      updated_at = now()
    where id = v_existing_lead_id;

    insert into lead_signals (
      lead_id,
      ambassador_id,
      signal_type,
      signal_value,
      confidence_weight,
      verified
    )
    values
      (v_existing_lead_id, v_ambassador_id, 'ip_signature', v_ip_signature, 20, false),
      (v_existing_lead_id, v_ambassador_id, 'device_signature', v_device_signature, 25, false)
    on conflict (lead_id, signal_type, signal_value)
    do update set
      last_seen_at = now(),
      seen_count = lead_signals.seen_count + 1;

    insert into lead_events (
      lead_id,
      ambassador_id,
      event_type,
      event_title,
      event_description,
      event_data
    )
    values (
      v_existing_lead_id,
      v_ambassador_id,
      'repeat_click',
      'Referral link clicked again',
      'This lead clicked the ambassador referral link again. No new lead count or points were added.',
      jsonb_build_object(
        'referral_code', p_referral_code,
        'ip_address', p_ip_address,
        'user_agent', p_user_agent,
        'ip_signature', v_ip_signature,
        'device_signature', v_device_signature
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."track_whatsapp_referral_click"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_whatsapp_referral_click_v2"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text", "p_visitor_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ambassador_id uuid;
  v_identity_id uuid;
  v_existing_lead_id uuid;
  v_new_lead_id uuid;
  v_click_id uuid;
  v_ip_signature text;
  v_device_signature text;
  v_signals jsonb;
begin
  v_ip_signature := md5(coalesce(p_ip_address, 'unknown_ip'));
  v_device_signature := md5(coalesce(p_user_agent, 'unknown_device'));

  select id
  into v_ambassador_id
  from ambassadors
  where status = 'active'
  and (
    lower(referral_code) = lower(p_referral_code)
    or lower(custom_referral_code) = lower(p_referral_code)
  )
  limit 1;

  if v_ambassador_id is null then
    return;
  end if;

  v_signals := jsonb_build_array(
    jsonb_build_object('type', 'visitor_id', 'value', p_visitor_id),
    jsonb_build_object('type', 'ip_signature', 'value', v_ip_signature),
    jsonb_build_object('type', 'device_signature', 'value', v_device_signature)
  );

  v_identity_id := public.upsert_identity_from_signals(
    v_signals,
    null,
    null,
    null,
    'referral_click'
  );

  perform public.detect_identity_ambassador_conflict(
    v_identity_id,
    v_ambassador_id
  );

  select id
  into v_existing_lead_id
  from leads
  where ambassador_id = v_ambassador_id
  and identity_id = v_identity_id
  limit 1;

  insert into referral_clicks (
    ambassador_id,
    referral_code,
    source,
    ip_address,
    user_agent,
    visitor_id,
    identity_id,
    lead_id,
    match_score,
    match_reason,
    created_at,
    counted_as_lead
  )
  values (
    v_ambassador_id,
    p_referral_code,
    'whatsapp',
    p_ip_address,
    p_user_agent,
    p_visitor_id,
    v_identity_id,
    v_existing_lead_id,
    100,
    'identity_engine_match',
    now(),
    false
  )
  returning id into v_click_id;

  if v_existing_lead_id is null then
    insert into leads (
      ambassador_id,
      identity_id,
      source,
      customer_name,
      customer_phone,
      referral_code_used,
      status,
      funnel_stage,
      lead_approval_status,
      approved_as_lead,
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
      'WhatsApp Lead',
      'Not provided',
      p_referral_code,
      'new',
      'new_lead',
      'pending',
      false,
      v_ip_signature,
      v_device_signature,
      1,
      now(),
      'unique',
      100,
      jsonb_build_array(p_visitor_id),
      jsonb_build_array(v_ip_signature),
      jsonb_build_array(v_device_signature),
      'identity_linked',
      false,
      now(),
      now()
    )
    returning id into v_new_lead_id;

    update referral_clicks
    set lead_id = v_new_lead_id
    where id = v_click_id;

    insert into lead_events (
      lead_id,
      ambassador_id,
      event_type,
      event_title,
      event_description,
      event_data
    )
    values (
      v_new_lead_id,
      v_ambassador_id,
      'lead_pending',
      'Pending lead created',
      'A referral click created a pending lead. It will count after admin approval.',
      jsonb_build_object(
        'identity_id', v_identity_id,
        'referral_code', p_referral_code,
        'visitor_id', p_visitor_id
      )
    );

    insert into crm_notifications (
      notification_type,
      title,
      message,
      related_entity_type,
      related_entity_id,
      identity_id,
      lead_id,
      priority,
      status
    )
    values (
      'lead_pending_approval',
      'New pending lead',
      'A new referral click created a pending lead that needs review.',
      'lead',
      v_new_lead_id,
      v_identity_id,
      v_new_lead_id,
      'normal',
      'unread'
    );
  else
    update leads
    set
      click_count = coalesce(click_count, 0) + 1,
      last_clicked_at = now(),
      updated_at = now()
    where id = v_existing_lead_id;

    insert into lead_events (
      lead_id,
      ambassador_id,
      event_type,
      event_title,
      event_description,
      event_data
    )
    values (
      v_existing_lead_id,
      v_ambassador_id,
      'repeat_click',
      'Referral link clicked again',
      'A known identity clicked this ambassador referral link again.',
      jsonb_build_object(
        'identity_id', v_identity_id,
        'referral_code', p_referral_code,
        'visitor_id', p_visitor_id
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."track_whatsapp_referral_click_v2"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text", "p_visitor_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ambassador_balance_on_payout"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE ambassadors 
    SET total_cashed_out = COALESCE(total_cashed_out, 0) + NEW.amount,
        available_balance = COALESCE(available_balance, 0) - NEW.amount,
        total_points = total_points - NEW.points_paid
    WHERE id = NEW.ambassador_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ambassador_balance_on_payout"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_quote_status"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_quote record;
begin
  if not exists (
    select 1 from users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can update quote status';
  end if;

  if p_status not in ('draft', 'sent', 'accepted', 'rejected', 'expired') then
    raise exception 'Invalid quote status';
  end if;

  select * into v_quote
  from crm_quotes
  where id = p_quote_id;

  if v_quote.id is null then
    raise exception 'Quote not found';
  end if;

  update crm_quotes
  set
    status = p_status,
    updated_at = now()
  where id = p_quote_id;

  if v_quote.identity_id is not null then
    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_quote.identity_id,
      'quote_status_changed',
      'Quote status changed',
      'Quote status was updated.',
      jsonb_build_object(
        'quote_id', p_quote_id,
        'old_status', v_quote.status,
        'new_status', p_status
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."update_quote_status"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_identity_from_signals"("p_signals" "jsonb", "p_primary_name" "text" DEFAULT NULL::"text", "p_primary_phone" "text" DEFAULT NULL::"text", "p_primary_email" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_identity_id uuid;
  v_score integer := 0;
  v_reasons jsonb := '[]'::jsonb;
  v_signal jsonb;
  v_signal_type text;
  v_signal_value text;
  v_weight integer := 0;
begin
  select m.identity_id, m.total_score, m.reasons
  into v_identity_id, v_score, v_reasons
  from public.find_best_identity_match(p_signals) m
  limit 1;

  if v_identity_id is null or coalesce(v_score, 0) < 70 then
    insert into identities (
      primary_name,
      primary_phone,
      primary_email,
      confidence_score,
      created_at,
      updated_at
    )
    values (
      p_primary_name,
      p_primary_phone,
      p_primary_email,
      coalesce(v_score, 0),
      now(),
      now()
    )
    returning id into v_identity_id;

    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_identity_id,
      'identity_created',
      'Identity created',
      'A new identity was created from incoming signals.',
      jsonb_build_object(
        'source', p_source,
        'score', coalesce(v_score, 0),
        'reasons', coalesce(v_reasons, '[]'::jsonb)
      )
    );
  else
    update identities
    set
      primary_name = coalesce(primary_name, p_primary_name),
      primary_phone = coalesce(primary_phone, p_primary_phone),
      primary_email = coalesce(primary_email, p_primary_email),
      confidence_score = greatest(coalesce(confidence_score, 0), coalesce(v_score, 0)),
      updated_at = now()
    where id = v_identity_id;

    insert into identity_events (
      identity_id,
      event_type,
      title,
      description,
      metadata
    )
    values (
      v_identity_id,
      'identity_matched',
      'Identity matched',
      'Incoming signals matched an existing identity.',
      jsonb_build_object(
        'source', p_source,
        'score', coalesce(v_score, 0),
        'reasons', coalesce(v_reasons, '[]'::jsonb)
      )
    );
  end if;

  for v_signal in select * from jsonb_array_elements(p_signals)
  loop
    v_signal_type := v_signal->>'type';
    v_signal_value := lower(trim(v_signal->>'value'));

    if v_signal_type is not null and v_signal_value is not null and v_signal_value <> '' then
      select weight
      into v_weight
      from identity_signal_weights
      where signal_type = v_signal_type;

      insert into identity_signals (
        identity_id,
        signal_type,
        signal_value,
        confidence_weight,
        verified,
        source
      )
      values (
        v_identity_id,
        v_signal_type,
        v_signal_value,
        coalesce(v_weight, 0),
        case when coalesce(v_weight, 0) >= 100 then true else false end,
        p_source
      )
      on conflict (identity_id, signal_type, signal_value)
      do update set
        last_seen_at = now(),
        seen_count = identity_signals.seen_count + 1,
        confidence_weight = greatest(identity_signals.confidence_weight, excluded.confidence_weight);
    end if;
  end loop;

  return v_identity_id;
end;
$$;


ALTER FUNCTION "public"."upsert_identity_from_signals"("p_signals" "jsonb", "p_primary_name" "text", "p_primary_phone" "text", "p_primary_email" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.invite_code IS NOT NULL THEN
    -- Check if code exists and is valid
    IF NOT EXISTS (
      SELECT 1 FROM invite_links 
      WHERE code = NEW.invite_code 
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR used_count < max_uses)
    ) THEN
      RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    -- Increment used count
    UPDATE invite_links 
    SET used_count = used_count + 1,
        status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END
    WHERE code = NEW.invite_code;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_invite_code"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ambassador_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "post_url" "text" NOT NULL,
    "caption" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "points_awarded" integer DEFAULT 0,
    "rejection_reason" "text",
    CONSTRAINT "activities_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'tiktok'::"text", 'twitter'::"text", 'threads'::"text"]))),
    CONSTRAINT "activities_status_check" CHECK (("status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "related_table" "text",
    "related_id" "uuid",
    "ambassador_id" "uuid",
    "lead_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ambassador_bonuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ambassador_id" "uuid",
    "amount" numeric NOT NULL,
    "reason" "text",
    "added_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ambassador_bonuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ambassadors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ambassador_tag" "text" NOT NULL,
    "referral_code" "text" NOT NULL,
    "whatsapp_number" "text" DEFAULT '+2348146503700'::"text" NOT NULL,
    "whatsapp_link" "text" NOT NULL,
    "bio" "text",
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "total_points" integer DEFAULT 0,
    "total_leads" integer DEFAULT 0,
    "total_conversions" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "custom_referral_code" "text",
    "custom_referral_code_set" boolean DEFAULT false,
    "total_cashed_out" numeric DEFAULT 0,
    "available_balance" numeric DEFAULT 0,
    "date_of_birth" "date",
    "bank_name" "text",
    "bank_account_number" "text",
    "bank_account_name" "text",
    "display_name" "text",
    CONSTRAINT "ambassadors_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."ambassadors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canonical_wheel_sessions" (
    "token_hash" "text" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "identity_id" "uuid" NOT NULL,
    "spin_player_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "canonical_wheel_sessions_expiry_check" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "canonical_wheel_sessions_visitor_check" CHECK ((NULLIF(TRIM(BOTH FROM "visitor_id"), ''::"text") IS NOT NULL))
);


ALTER TABLE "public"."canonical_wheel_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "product_id" "uuid",
    "ambassador_id" "uuid",
    "quantity" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cart_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_off_accounts" (
    "identity_id" "uuid" NOT NULL,
    "balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_credited" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_debited" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_redeemed" numeric(14,2) DEFAULT 0 NOT NULL,
    "total_refunded" numeric(14,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_off_accounts_balance_check" CHECK (("balance" >= (0)::numeric)),
    CONSTRAINT "cash_off_accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'frozen'::"text", 'closed'::"text"]))),
    CONSTRAINT "cash_off_accounts_total_credited_check" CHECK (("total_credited" >= (0)::numeric)),
    CONSTRAINT "cash_off_accounts_total_debited_check" CHECK (("total_debited" >= (0)::numeric)),
    CONSTRAINT "cash_off_accounts_total_redeemed_check" CHECK (("total_redeemed" >= (0)::numeric)),
    CONSTRAINT "cash_off_accounts_total_refunded_check" CHECK (("total_refunded" >= (0)::numeric))
);


ALTER TABLE "public"."cash_off_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_off_source_balances" (
    "source_system" "text" NOT NULL,
    "source_account_key" "text" NOT NULL,
    "identity_id" "uuid" NOT NULL,
    "imported_balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "sync_version" integer DEFAULT 0 NOT NULL,
    "source_updated_at" timestamp with time zone,
    "first_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "cash_off_source_balances_imported_balance_check" CHECK (("imported_balance" >= (0)::numeric)),
    CONSTRAINT "cash_off_source_balances_sync_version_check" CHECK (("sync_version" >= 0))
);


ALTER TABLE "public"."cash_off_source_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_off_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "source_system" "text" DEFAULT 'system'::"text" NOT NULL,
    "source_reference" "text",
    "order_reference" "text",
    "spin_log_id" "uuid",
    "created_by" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_off_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cash_off_transactions_balance_after_check" CHECK (("balance_after" >= (0)::numeric)),
    CONSTRAINT "cash_off_transactions_balance_before_check" CHECK (("balance_before" >= (0)::numeric)),
    CONSTRAINT "cash_off_transactions_direction_check" CHECK (("direction" = ANY (ARRAY['credit'::"text", 'debit'::"text"]))),
    CONSTRAINT "cash_off_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['spin_reward'::"text", 'legacy_spin_migration'::"text", 'legacy_spin_migration_reversal'::"text", 'order_redemption'::"text", 'order_refund'::"text", 'admin_credit'::"text", 'admin_debit'::"text", 'correction_credit'::"text", 'correction_debit'::"text", 'promotion'::"text"])))
);


ALTER TABLE "public"."cash_off_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_message_bank" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_type" "text" NOT NULL,
    "part_key" "text" NOT NULL,
    "phrase" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_message_bank" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "ambassador_id" "uuid" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "commission_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "commission_rate" numeric(5,4) DEFAULT 0.05 NOT NULL,
    "approved_by" "uuid" NOT NULL,
    "approved_at" timestamp with time zone DEFAULT "now"(),
    "points_generated" integer DEFAULT 0,
    "commission_percentage" numeric DEFAULT 5,
    "conversion_sequence" integer DEFAULT 1,
    "is_repeat_conversion" boolean DEFAULT false,
    "is_commissionable" boolean DEFAULT true,
    "ambassador_notified" boolean DEFAULT false,
    "admin_attention_required" boolean DEFAULT false,
    "internal_note" "text"
);


ALTER TABLE "public"."conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "old_data" "jsonb" DEFAULT '{}'::"jsonb",
    "new_data" "jsonb" DEFAULT '{}'::"jsonb",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_communications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "lead_id" "uuid",
    "channel" "text" NOT NULL,
    "direction" "text" DEFAULT 'outbound'::"text",
    "subject" "text",
    "message" "text",
    "status" "text" DEFAULT 'logged'::"text",
    "handled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_communications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "lead_id" "uuid",
    "sale_id" "uuid",
    "quote_id" "uuid",
    "invoice_id" "uuid",
    "receipt_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text",
    "file_size" bigint,
    "category" "text" DEFAULT 'general'::"text",
    "note" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_followups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "lead_id" "uuid",
    "assigned_to" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "priority" "text" DEFAULT 'normal'::"text",
    "created_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_funnel_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "identity_id" "uuid",
    "old_stage" "text",
    "new_stage" "text" NOT NULL,
    "changed_by" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_funnel_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_funnel_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stage_key" "text" NOT NULL,
    "stage_name" "text" NOT NULL,
    "stage_order" integer NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_funnel_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "invoice_number" "text" DEFAULT ((('INV-'::"text" || "to_char"("now"(), 'YYYYMMDD'::"text")) || '-'::"text") || "upper"("substr"("md5"(("random"())::"text"), 1, 6))) NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    "issued_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "sent_to_email" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "identity_id" "uuid",
    "lead_id" "uuid",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'unread'::"text",
    "created_for" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."crm_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_name" "text" NOT NULL,
    "product_category" "text",
    "description" "text",
    "default_price" numeric DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_quote_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid",
    "product_id" "uuid",
    "item_name" "text" NOT NULL,
    "description" "text",
    "quantity" integer DEFAULT 1,
    "unit_price" numeric DEFAULT 0,
    "total_price" numeric GENERATED ALWAYS AS ((("quantity")::numeric * "unit_price")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_quote_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "lead_id" "uuid",
    "quote_number" "text" DEFAULT ((('QTE-'::"text" || "to_char"("now"(), 'YYYYMMDD'::"text")) || '-'::"text") || "upper"("substr"("md5"(("random"())::"text"), 1, 6))) NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "customer_email" "text",
    "subtotal" numeric DEFAULT 0,
    "discount_amount" numeric DEFAULT 0,
    "total_amount" numeric DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text",
    "valid_until" "date",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "receipt_number" "text" DEFAULT ((('RCT-'::"text" || "to_char"("now"(), 'YYYYMMDD'::"text")) || '-'::"text") || "upper"("substr"("md5"(("random"())::"text"), 1, 6))) NOT NULL,
    "amount" numeric NOT NULL,
    "payment_method" "text",
    "payment_reference" "text",
    "sent_to_email" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "product_id" "uuid",
    "item_name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "total_price" numeric GENERATED ALWAYS AS ((("quantity")::numeric * "unit_price")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "lead_id" "uuid",
    "conversion_id" "uuid",
    "sale_code" "text" DEFAULT ('SALE-'::"text" || "upper"("substr"("md5"(("random"())::"text"), 1, 8))) NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "customer_email" "text",
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "amount_paid" numeric DEFAULT 0 NOT NULL,
    "balance_due" numeric GENERATED ALWAYS AS (("total_amount" - "amount_paid")) STORED,
    "status" "text" DEFAULT 'draft'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_code" "text" DEFAULT ('IDN-'::"text" || "upper"("substr"("md5"(("random"())::"text"), 1, 8))) NOT NULL,
    "primary_name" "text",
    "primary_phone" "text",
    "primary_email" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "confidence_score" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_ambassador_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "original_ambassador_id" "uuid",
    "new_ambassador_id" "uuid",
    "reason" "text",
    "confidence" integer DEFAULT 100,
    "decision" "text" DEFAULT 'pending'::"text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."identity_ambassador_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "event_type" "text",
    "title" "text",
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."identity_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ambassador_id" "uuid",
    "source" "text" NOT NULL,
    "source_detail" "jsonb" DEFAULT '{}'::"jsonb",
    "customer_name" "text",
    "customer_phone" "text" NOT NULL,
    "customer_email" "text",
    "referral_code_used" "text",
    "whatsapp_link_used" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "notes" "text",
    "assigned_admin" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "visitor_id" "text",
    "product_id" "uuid",
    "lead_type" "text",
    "source_page" "text",
    "lead_code" "text",
    "click_count" integer DEFAULT 1,
    "last_clicked_at" timestamp with time zone,
    "ip_signature" "text",
    "device_signature" "text",
    "duplicate_status" "text" DEFAULT 'unique'::"text",
    "merged_into_lead_id" "uuid",
    "confidence_score" integer DEFAULT 0,
    "edit_status" "text" DEFAULT 'none'::"text",
    "pending_customer_name" "text",
    "pending_customer_phone" "text",
    "visitor_ids" "jsonb" DEFAULT '[]'::"jsonb",
    "ip_signatures" "jsonb" DEFAULT '[]'::"jsonb",
    "device_signatures" "jsonb" DEFAULT '[]'::"jsonb",
    "phone_numbers" "jsonb" DEFAULT '[]'::"jsonb",
    "name_history" "jsonb" DEFAULT '[]'::"jsonb",
    "lead_intelligence_status" "text" DEFAULT 'unique'::"text",
    "needs_merge_review" boolean DEFAULT false,
    "identity_id" "uuid",
    "funnel_stage" "text" DEFAULT 'new_lead'::"text",
    "conversation_greeting" "text",
    "conversation_opening" "text",
    "conversation_closing" "text",
    "conversation_message" "text",
    "conversation_fingerprint" "text",
    "lead_approval_status" "text" DEFAULT 'pending'::"text",
    "approved_as_lead" boolean DEFAULT false,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "whatsapp_message" "text",
    "whatsapp_url" "text",
    CONSTRAINT "leads_source_check" CHECK (("source" = ANY (ARRAY['whatsapp'::"text", 'referral'::"text", 'social'::"text", 'direct'::"text", 'website_cart'::"text"]))),
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'converted'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."identity_lifetime_value" AS
 SELECT "i"."id" AS "identity_id",
    "i"."identity_code",
    "i"."primary_name",
    "i"."primary_phone",
    "i"."primary_email",
    "count"(DISTINCT "l"."id") AS "total_leads",
    "count"(DISTINCT "c"."id") AS "total_conversions",
    "count"(DISTINCT "s"."id") AS "total_sales",
    COALESCE("sum"(DISTINCT "s"."total_amount"), (0)::numeric) AS "lifetime_revenue",
    COALESCE("sum"(DISTINCT "s"."amount_paid"), (0)::numeric) AS "lifetime_paid",
    COALESCE("sum"(DISTINCT "s"."balance_due"), (0)::numeric) AS "lifetime_balance_due",
    "min"("l"."created_at") AS "first_lead_at",
    "max"("l"."updated_at") AS "last_lead_update_at",
    "max"("s"."created_at") AS "last_sale_at"
   FROM ((("public"."identities" "i"
     LEFT JOIN "public"."leads" "l" ON (("l"."identity_id" = "i"."id")))
     LEFT JOIN "public"."conversions" "c" ON (("c"."lead_id" = "l"."id")))
     LEFT JOIN "public"."crm_sales" "s" ON (("s"."identity_id" = "i"."id")))
  WHERE ("i"."status" = 'active'::"text")
  GROUP BY "i"."id", "i"."identity_code", "i"."primary_name", "i"."primary_phone", "i"."primary_email";


ALTER VIEW "public"."identity_lifetime_value" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_match_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_a" "uuid",
    "identity_b" "uuid",
    "confidence" integer,
    "reasons" "jsonb" DEFAULT '[]'::"jsonb",
    "decision" "text" DEFAULT 'pending'::"text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."identity_match_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_signal_weights" (
    "signal_type" "text" NOT NULL,
    "weight" integer NOT NULL,
    "auto_merge" boolean DEFAULT false,
    "needs_review_threshold" integer DEFAULT 70,
    "strong_match_threshold" integer DEFAULT 90,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."identity_signal_weights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "signal_type" "text" NOT NULL,
    "signal_value" "text" NOT NULL,
    "confidence_weight" integer DEFAULT 0,
    "verified" boolean DEFAULT false,
    "first_seen_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "seen_count" integer DEFAULT 1,
    "source" "text"
);


ALTER TABLE "public"."identity_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invite_links" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "max_uses" integer DEFAULT 1,
    "used_count" integer DEFAULT 0,
    "expires_at" timestamp with time zone,
    "role" "text" DEFAULT 'ambassador'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invite_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "ambassador_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_title" "text" NOT NULL,
    "event_description" "text",
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "ambassador_id" "uuid",
    "signal_type" "text" NOT NULL,
    "signal_value" "text" NOT NULL,
    "confidence_weight" integer DEFAULT 0,
    "first_seen_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "seen_count" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "verified" boolean DEFAULT false
);


ALTER TABLE "public"."lead_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'ambassador'::"text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "invite_code" "text",
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'ambassador'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."leaderboard" AS
 SELECT "a"."id" AS "ambassador_id",
    "u"."name",
    "a"."ambassador_tag" AS "tag",
    "a"."total_points",
    "a"."total_leads",
    "a"."total_conversions",
    COALESCE(( SELECT "sum"("conversions"."amount") AS "sum"
           FROM "public"."conversions"
          WHERE ("conversions"."ambassador_id" = "a"."id")), (0)::numeric) AS "conversion_value",
    "row_number"() OVER (ORDER BY "a"."total_points" DESC) AS "rank"
   FROM ("public"."ambassadors" "a"
     JOIN "public"."users" "u" ON (("a"."user_id" = "u"."id")))
  WHERE ("a"."status" = 'active'::"text")
  ORDER BY "a"."total_points" DESC;


ALTER VIEW "public"."leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ambassador_id" "uuid" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "points_paid" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."point_transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ambassador_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "type" "text" NOT NULL,
    "reference_id" "uuid",
    "reference_type" "text",
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "point_transactions_type_check" CHECK (("type" = ANY (ARRAY['post'::"text", 'lead'::"text", 'conversion'::"text", 'bonus'::"text"])))
);


ALTER TABLE "public"."point_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "image_path" "text",
    "is_primary" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_interests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "lead_id" "uuid",
    "product_id" "uuid",
    "interest_type" "text" DEFAULT 'like'::"text",
    "source" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "product_id" "uuid",
    "ambassador_id" "uuid",
    "viewed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "price" numeric DEFAULT 0,
    "image_url" "text",
    "category" "text",
    "stock" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "featured" boolean DEFAULT false,
    "admin_notes" "text",
    "original_price" numeric DEFAULT 0,
    "discount_percentage" integer DEFAULT 0,
    "sale_price" numeric DEFAULT 0,
    "product_tag" "text",
    "category_id" "uuid",
    "publish_block_reason" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ambassador_id" "uuid",
    "referral_code" "text" NOT NULL,
    "source" "text" DEFAULT 'whatsapp'::"text",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "visitor_fingerprint" "text",
    "counted_as_lead" boolean DEFAULT false,
    "visitor_id" "text",
    "lead_id" "uuid",
    "match_score" integer DEFAULT 0,
    "match_reason" "text",
    "identity_id" "uuid",
    "whatsapp_message" "text",
    "whatsapp_url" "text"
);


ALTER TABLE "public"."referral_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_route_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "step" "text",
    "message" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_route_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_campaign_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "tracking_token" "text" DEFAULT "lower"("encode"("extensions"."gen_random_bytes"(6), 'hex'::"text")) NOT NULL,
    "sms_status" "text" DEFAULT 'selected'::"text" NOT NULL,
    "exported_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "click_count" integer DEFAULT 0 NOT NULL,
    "whatsapp_claimed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_campaign_recipients_sms_status_check" CHECK (("sms_status" = ANY (ARRAY['selected'::"text", 'exported'::"text", 'sent'::"text", 'delivered'::"text", 'clicked'::"text", 'claimed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."sms_campaign_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_player_id" "text",
    "first_name" "text",
    "full_name" "text",
    "phone_normalized" "text" NOT NULL,
    "joined_at" timestamp with time zone,
    "whatsapp_outreach_status" "text" DEFAULT 'not_messaged'::"text" NOT NULL,
    "outreach_status_source" "text" DEFAULT 'default'::"text" NOT NULL,
    "outreach_status_imported_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_leads_whatsapp_outreach_status_check" CHECK (("whatsapp_outreach_status" = ANY (ARRAY['not_messaged'::"text", 'messaged'::"text", 'messaged_us_before'::"text", 'excluded'::"text"])))
);


ALTER TABLE "public"."sms_leads" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."sms_campaign_recipient_details" AS
 SELECT "recipient"."id",
    "recipient"."campaign_id",
    "recipient"."lead_id",
    "recipient"."tracking_token",
    "recipient"."sms_status",
    "recipient"."exported_at",
    "recipient"."sent_at",
    "recipient"."delivered_at",
    "recipient"."failed_at",
    "recipient"."clicked_at",
    "recipient"."click_count",
    "recipient"."whatsapp_claimed_at",
    "recipient"."created_at",
    "lead"."first_name",
    "lead"."full_name",
    "lead"."phone_normalized",
    "lead"."joined_at",
    "lead"."whatsapp_outreach_status"
   FROM ("public"."sms_campaign_recipients" "recipient"
     JOIN "public"."sms_leads" "lead" ON (("lead"."id" = "recipient"."lead_id")));


ALTER VIEW "public"."sms_campaign_recipient_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sms_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "message_template" "text" NOT NULL,
    "whatsapp_number" "text" NOT NULL,
    "whatsapp_message" "text" DEFAULT 'Hello EmmyTech, I want to claim my 2 free spins.'::"text" NOT NULL,
    "public_base_url" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "activated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."sms_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_cash_challenge_credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "identity_id" "uuid" NOT NULL,
    "spin_player_id" "uuid" NOT NULL,
    "spin_log_id" "uuid",
    "request_id" "uuid" NOT NULL,
    "amount_won" numeric(14,2) NOT NULL,
    "amount_credited" numeric(14,2) NOT NULL,
    "balance_before" numeric(14,2) NOT NULL,
    "balance_after" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "spin_cash_challenge_credits_balances_check" CHECK ((("balance_before" >= (0)::numeric) AND ("balance_after" >= "balance_before") AND ("balance_after" <= (3000)::numeric))),
    CONSTRAINT "spin_cash_challenge_credits_credited_check" CHECK (("amount_credited" >= (0)::numeric)),
    CONSTRAINT "spin_cash_challenge_credits_won_check" CHECK (("amount_won" > (0)::numeric))
);


ALTER TABLE "public"."spin_cash_challenge_credits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_cash_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid" NOT NULL,
    "spin_player_id" "uuid" NOT NULL,
    "cycle_number" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "cash_balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "cash_cap" numeric(14,2) DEFAULT 3000 NOT NULL,
    "cash_target" numeric(14,2) DEFAULT 1000 NOT NULL,
    "conversion_floor" numeric(14,2) DEFAULT 700 NOT NULL,
    "converted_cash_off_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "processed_at" timestamp with time zone,
    "last_credit_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "spin_cash_challenges_balance_check" CHECK ((("cash_balance" >= (0)::numeric) AND ("cash_balance" <= "cash_cap"))),
    CONSTRAINT "spin_cash_challenges_cap_check" CHECK (("cash_cap" = (3000)::numeric)),
    CONSTRAINT "spin_cash_challenges_conversion_check" CHECK (("converted_cash_off_amount" >= (0)::numeric)),
    CONSTRAINT "spin_cash_challenges_expiry_check" CHECK (("expires_at" > "started_at")),
    CONSTRAINT "spin_cash_challenges_floor_check" CHECK (("conversion_floor" = (700)::numeric)),
    CONSTRAINT "spin_cash_challenges_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'converted_to_cash_off'::"text", 'cash_eligible'::"text", 'closed'::"text"]))),
    CONSTRAINT "spin_cash_challenges_target_check" CHECK (("cash_target" = (1000)::numeric))
);


ALTER TABLE "public"."spin_cash_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_cashout_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "spin_player_id" "uuid",
    "old_cashout_request_id" "uuid",
    "old_spin_profile_id" "uuid",
    "amount" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "paid_at" timestamp with time zone,
    "admin_note" "text",
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_cashout_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_dm_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "spin_player_id" "uuid",
    "old_dm_click_id" "uuid",
    "old_spin_profile_id" "uuid",
    "old_spin_log_id" "uuid",
    "spin_log_id" "uuid",
    "prize_label" "text",
    "claim_message" "text",
    "bonus_spin_granted" boolean DEFAULT false,
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_dm_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_game_settings" (
    "setting_key" "text" NOT NULL,
    "setting_value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_game_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_letter_segments" (
    "segment_code" "text" NOT NULL,
    "segment_order" integer NOT NULL,
    "is_active" boolean DEFAULT true,
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_letter_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "spin_player_id" "uuid",
    "old_spin_log_id" "uuid",
    "old_spin_profile_id" "uuid",
    "old_prize_id" integer,
    "prize_id" "uuid",
    "result_label" "text" NOT NULL,
    "result_type" "text",
    "cash_amount" numeric DEFAULT 0,
    "letter_code" "text",
    "wallet_before" numeric DEFAULT 0,
    "wallet_after" numeric DEFAULT 0,
    "ip_address" "text",
    "device_id" "text",
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reward_mode" "text" DEFAULT 'legacy_cash'::"text" NOT NULL,
    "request_id" "uuid",
    "cash_off_before" numeric(14,2),
    "cash_off_after" numeric(14,2),
    "cash_off_transaction_id" "uuid",
    "spin_number" integer,
    "spin_rule_group_key" "text",
    "spin_rule_item_key" "text",
    "dm_bonus_granted" boolean DEFAULT false,
    "dm_clicked_at" timestamp with time zone,
    "claim_message" "text",
    "cash_challenge_id" "uuid",
    "cash_challenge_credit" numeric(14,2),
    "cash_challenge_balance_after" numeric(14,2),
    "cash_challenge_expires_at" timestamp with time zone
);


ALTER TABLE "public"."spin_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "old_spin_profile_id" "uuid",
    "phone_number" "text",
    "full_name" "text",
    "email" "text",
    "referral_code" "text",
    "referred_by_old_spin_profile_id" "uuid",
    "referred_by_identity_id" "uuid",
    "spins_remaining" integer DEFAULT 1,
    "wallet_balance" numeric DEFAULT 0,
    "total_referrals_count" integer DEFAULT 0,
    "total_cash_won" numeric DEFAULT 0,
    "cashout_target" numeric DEFAULT 1000,
    "spin_sequence_step" integer DEFAULT 0,
    "dm_bonus_claimed" boolean DEFAULT false,
    "dm_clicked_at" timestamp with time zone,
    "letters_unlocked" "text"[] DEFAULT '{}'::"text"[],
    "letter_challenge_completed" boolean DEFAULT false,
    "chosen_letter_reward" "text",
    "last_prize_won" "text",
    "last_prize_type" "text",
    "cashout_eligible" boolean DEFAULT false,
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "referred_by_referral_code" "text",
    "total_cash_off_won" numeric(14,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."spin_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_prizes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "old_prize_id" integer,
    "label" "text" NOT NULL,
    "prize_type" "text" NOT NULL,
    "gravity" integer DEFAULT 10,
    "stock" integer DEFAULT 0,
    "monetary_value" numeric DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "on_wheel" boolean DEFAULT false,
    "near_miss" boolean DEFAULT false,
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_prizes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_referral_awards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_spin_player_id" "uuid" NOT NULL,
    "referred_spin_player_id" "uuid" NOT NULL,
    "referrer_identity_id" "uuid",
    "referred_identity_id" "uuid",
    "referral_code" "text" NOT NULL,
    "spins_awarded" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spin_referral_awards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "old_referral_id" "uuid",
    "referrer_spin_player_id" "uuid",
    "referred_spin_player_id" "uuid",
    "referrer_identity_id" "uuid",
    "referred_identity_id" "uuid",
    "old_referrer_profile_id" "uuid",
    "old_referred_profile_id" "uuid",
    "invitee_phone" "text",
    "invitee_email" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "reward_granted" boolean DEFAULT false,
    "reward_spin_amount" integer DEFAULT 1,
    "rewarded_at" timestamp with time zone,
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_rule_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "old_group_id" "uuid",
    "group_key" "text" NOT NULL,
    "group_name" "text" NOT NULL,
    "group_type" "text" NOT NULL,
    "start_spin" integer NOT NULL,
    "end_spin" integer,
    "priority" integer DEFAULT 100,
    "is_active" boolean DEFAULT true,
    "description" "text",
    "old_created_at" timestamp with time zone,
    "old_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_rule_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_rule_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "old_item_id" "uuid",
    "old_group_id" "uuid",
    "group_id" "uuid",
    "item_key" "text" NOT NULL,
    "result_label" "text" NOT NULL,
    "result_type" "text" DEFAULT 'cash'::"text" NOT NULL,
    "cash_amount" numeric DEFAULT 0,
    "letter_code" "text",
    "bonus_spins" integer DEFAULT 0,
    "gravity" integer DEFAULT 1,
    "item_order" integer DEFAULT 1,
    "max_uses_per_user" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "old_created_at" timestamp with time zone,
    "old_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_rule_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "spin_player_id" "uuid",
    "old_transaction_id" "uuid",
    "old_spin_profile_id" "uuid",
    "amount" numeric NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text",
    "reference_id" "text",
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_user_prizes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "spin_player_id" "uuid",
    "old_user_prize_id" "uuid",
    "old_spin_profile_id" "uuid",
    "old_prize_id" integer,
    "prize_id" "uuid",
    "prize_label" "text" NOT NULL,
    "status" "text" DEFAULT 'available'::"text",
    "claimed_at" timestamp with time zone,
    "result_type" "text",
    "cash_amount" numeric DEFAULT 0,
    "letter_code" "text",
    "wallet_after" numeric DEFAULT 0,
    "claim_message" "text",
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reward_mode" "text" DEFAULT 'legacy_cash'::"text" NOT NULL,
    "cash_off_after" numeric(14,2),
    "cash_off_transaction_id" "uuid"
);


ALTER TABLE "public"."spin_user_prizes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spin_user_rule_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identity_id" "uuid",
    "spin_player_id" "uuid",
    "old_usage_id" "uuid",
    "old_spin_profile_id" "uuid",
    "old_spin_rule_item_id" "uuid",
    "spin_rule_item_id" "uuid",
    "spin_number" integer,
    "old_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."spin_user_rule_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "ambassador_id" "uuid",
    "referral_code" "text",
    "ip_address" "text",
    "user_agent" "text",
    "first_seen" timestamp with time zone DEFAULT "now"(),
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visitor_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "product_id" "uuid",
    "ambassador_id" "uuid",
    "event_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "source_page" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "website_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['website_visited'::"text", 'page_viewed'::"text", 'product_viewed'::"text", 'product_quick_viewed'::"text", 'product_shared'::"text", 'add_to_cart'::"text", 'remove_from_cart'::"text", 'whatsapp_purchase_clicked'::"text", 'spin_opened_from_product'::"text", 'reward_viewed'::"text", 'reward_applied'::"text", 'cash_off_product_selected'::"text", 'cash_off_product_changed'::"text", 'cash_off_product_removed'::"text", 'full_wheel_opened_from_overlay'::"text", 'full_wheel_opened_from_cart'::"text", 'returned_from_full_wheel'::"text"]))),
    CONSTRAINT "website_events_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."website_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_wheel_handoffs" (
    "token_hash" "text" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "product_id" "uuid",
    "source_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "consumed_at" timestamp with time zone,
    CONSTRAINT "website_wheel_handoffs_expiry_check" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "website_wheel_handoffs_source_path_check" CHECK ((("source_path" IS NULL) OR ("length"("source_path") <= 500))),
    CONSTRAINT "website_wheel_handoffs_visitor_id_check" CHECK ((NULLIF(TRIM(BOTH FROM "visitor_id"), ''::"text") IS NOT NULL))
);


ALTER TABLE "public"."website_wheel_handoffs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassador_bonuses"
    ADD CONSTRAINT "ambassador_bonuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_ambassador_tag_key" UNIQUE ("ambassador_tag");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."canonical_wheel_sessions"
    ADD CONSTRAINT "canonical_wheel_sessions_pkey" PRIMARY KEY ("token_hash");



ALTER TABLE ONLY "public"."cart_events"
    ADD CONSTRAINT "cart_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_off_accounts"
    ADD CONSTRAINT "cash_off_accounts_pkey" PRIMARY KEY ("identity_id");



ALTER TABLE ONLY "public"."cash_off_source_balances"
    ADD CONSTRAINT "cash_off_source_balances_pkey" PRIMARY KEY ("source_system", "source_account_key");



ALTER TABLE ONLY "public"."cash_off_transactions"
    ADD CONSTRAINT "cash_off_transactions_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."cash_off_transactions"
    ADD CONSTRAINT "cash_off_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_message_bank"
    ADD CONSTRAINT "conversation_message_bank_part_type_part_key_key" UNIQUE ("part_type", "part_key");



ALTER TABLE ONLY "public"."conversation_message_bank"
    ADD CONSTRAINT "conversation_message_bank_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversions"
    ADD CONSTRAINT "conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_audit_logs"
    ADD CONSTRAINT "crm_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_communications"
    ADD CONSTRAINT "crm_communications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_followups"
    ADD CONSTRAINT "crm_followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_funnel_events"
    ADD CONSTRAINT "crm_funnel_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_funnel_stages"
    ADD CONSTRAINT "crm_funnel_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_funnel_stages"
    ADD CONSTRAINT "crm_funnel_stages_stage_key_key" UNIQUE ("stage_key");



ALTER TABLE ONLY "public"."crm_invoices"
    ADD CONSTRAINT "crm_invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."crm_invoices"
    ADD CONSTRAINT "crm_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_products"
    ADD CONSTRAINT "crm_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_quote_items"
    ADD CONSTRAINT "crm_quote_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_quotes"
    ADD CONSTRAINT "crm_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_quotes"
    ADD CONSTRAINT "crm_quotes_quote_number_key" UNIQUE ("quote_number");



ALTER TABLE ONLY "public"."crm_receipts"
    ADD CONSTRAINT "crm_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_receipts"
    ADD CONSTRAINT "crm_receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."crm_sale_items"
    ADD CONSTRAINT "crm_sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sales"
    ADD CONSTRAINT "crm_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_sales"
    ADD CONSTRAINT "crm_sales_sale_code_key" UNIQUE ("sale_code");



ALTER TABLE ONLY "public"."identities"
    ADD CONSTRAINT "identities_identity_code_key" UNIQUE ("identity_code");



ALTER TABLE ONLY "public"."identities"
    ADD CONSTRAINT "identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_ambassador_conflicts"
    ADD CONSTRAINT "identity_ambassador_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_events"
    ADD CONSTRAINT "identity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_match_suggestions"
    ADD CONSTRAINT "identity_match_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_signal_weights"
    ADD CONSTRAINT "identity_signal_weights_pkey" PRIMARY KEY ("signal_type");



ALTER TABLE ONLY "public"."identity_signals"
    ADD CONSTRAINT "identity_signals_identity_id_signal_type_signal_value_key" UNIQUE ("identity_id", "signal_type", "signal_value");



ALTER TABLE ONLY "public"."identity_signals"
    ADD CONSTRAINT "identity_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invite_links"
    ADD CONSTRAINT "invite_links_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."invite_links"
    ADD CONSTRAINT "invite_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_signals"
    ADD CONSTRAINT "lead_signals_lead_id_signal_type_signal_value_key" UNIQUE ("lead_id", "signal_type", "signal_value");



ALTER TABLE ONLY "public"."lead_signals"
    ADD CONSTRAINT "lead_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_referral_awards"
    ADD CONSTRAINT "one_referral_reward_per_referred_player" UNIQUE ("referred_spin_player_id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_interests"
    ADD CONSTRAINT "product_interests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_views"
    ADD CONSTRAINT "product_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."referral_clicks"
    ADD CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_route_logs"
    ADD CONSTRAINT "referral_route_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_campaign_recipients"
    ADD CONSTRAINT "sms_campaign_recipients_campaign_id_lead_id_key" UNIQUE ("campaign_id", "lead_id");



ALTER TABLE ONLY "public"."sms_campaign_recipients"
    ADD CONSTRAINT "sms_campaign_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_campaign_recipients"
    ADD CONSTRAINT "sms_campaign_recipients_tracking_token_key" UNIQUE ("tracking_token");



ALTER TABLE ONLY "public"."sms_campaigns"
    ADD CONSTRAINT "sms_campaigns_campaign_key_key" UNIQUE ("campaign_key");



ALTER TABLE ONLY "public"."sms_campaigns"
    ADD CONSTRAINT "sms_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sms_leads"
    ADD CONSTRAINT "sms_leads_phone_normalized_key" UNIQUE ("phone_normalized");



ALTER TABLE ONLY "public"."sms_leads"
    ADD CONSTRAINT "sms_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_cash_challenge_credits"
    ADD CONSTRAINT "spin_cash_challenge_credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_cash_challenge_credits"
    ADD CONSTRAINT "spin_cash_challenge_credits_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."spin_cash_challenges"
    ADD CONSTRAINT "spin_cash_challenges_cycle_unique" UNIQUE ("spin_player_id", "cycle_number");



ALTER TABLE ONLY "public"."spin_cash_challenges"
    ADD CONSTRAINT "spin_cash_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_cashout_requests"
    ADD CONSTRAINT "spin_cashout_requests_old_cashout_request_id_key" UNIQUE ("old_cashout_request_id");



ALTER TABLE ONLY "public"."spin_cashout_requests"
    ADD CONSTRAINT "spin_cashout_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_dm_clicks"
    ADD CONSTRAINT "spin_dm_clicks_old_dm_click_id_key" UNIQUE ("old_dm_click_id");



ALTER TABLE ONLY "public"."spin_dm_clicks"
    ADD CONSTRAINT "spin_dm_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_game_settings"
    ADD CONSTRAINT "spin_game_settings_pkey" PRIMARY KEY ("setting_key");



ALTER TABLE ONLY "public"."spin_letter_segments"
    ADD CONSTRAINT "spin_letter_segments_pkey" PRIMARY KEY ("segment_code");



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_old_spin_log_id_key" UNIQUE ("old_spin_log_id");



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_players"
    ADD CONSTRAINT "spin_players_old_spin_profile_id_key" UNIQUE ("old_spin_profile_id");



ALTER TABLE ONLY "public"."spin_players"
    ADD CONSTRAINT "spin_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_prizes"
    ADD CONSTRAINT "spin_prizes_old_prize_id_key" UNIQUE ("old_prize_id");



ALTER TABLE ONLY "public"."spin_prizes"
    ADD CONSTRAINT "spin_prizes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_referral_awards"
    ADD CONSTRAINT "spin_referral_awards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_referrals"
    ADD CONSTRAINT "spin_referrals_old_referral_id_key" UNIQUE ("old_referral_id");



ALTER TABLE ONLY "public"."spin_referrals"
    ADD CONSTRAINT "spin_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_rule_groups"
    ADD CONSTRAINT "spin_rule_groups_old_group_id_key" UNIQUE ("old_group_id");



ALTER TABLE ONLY "public"."spin_rule_groups"
    ADD CONSTRAINT "spin_rule_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_rule_items"
    ADD CONSTRAINT "spin_rule_items_old_item_id_key" UNIQUE ("old_item_id");



ALTER TABLE ONLY "public"."spin_rule_items"
    ADD CONSTRAINT "spin_rule_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_transactions"
    ADD CONSTRAINT "spin_transactions_old_transaction_id_key" UNIQUE ("old_transaction_id");



ALTER TABLE ONLY "public"."spin_transactions"
    ADD CONSTRAINT "spin_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_user_prizes"
    ADD CONSTRAINT "spin_user_prizes_old_user_prize_id_key" UNIQUE ("old_user_prize_id");



ALTER TABLE ONLY "public"."spin_user_prizes"
    ADD CONSTRAINT "spin_user_prizes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spin_user_rule_usage"
    ADD CONSTRAINT "spin_user_rule_usage_old_usage_id_key" UNIQUE ("old_usage_id");



ALTER TABLE ONLY "public"."spin_user_rule_usage"
    ADD CONSTRAINT "spin_user_rule_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitor_sessions"
    ADD CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitor_sessions"
    ADD CONSTRAINT "visitor_sessions_visitor_id_key" UNIQUE ("visitor_id");



ALTER TABLE ONLY "public"."website_events"
    ADD CONSTRAINT "website_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_wheel_handoffs"
    ADD CONSTRAINT "website_wheel_handoffs_pkey" PRIMARY KEY ("token_hash");



CREATE INDEX "admin_notifications_unread_idx" ON "public"."admin_notifications" USING "btree" ("is_read", "created_at");



CREATE INDEX "cash_off_source_balances_identity_idx" ON "public"."cash_off_source_balances" USING "btree" ("identity_id");



CREATE INDEX "cash_off_transactions_identity_created_idx" ON "public"."cash_off_transactions" USING "btree" ("identity_id", "created_at" DESC);



CREATE INDEX "cash_off_transactions_source_idx" ON "public"."cash_off_transactions" USING "btree" ("source_system", "source_reference");



CREATE INDEX "cash_off_transactions_spin_log_idx" ON "public"."cash_off_transactions" USING "btree" ("spin_log_id") WHERE ("spin_log_id" IS NOT NULL);



CREATE INDEX "idx_activities_ambassador" ON "public"."activities" USING "btree" ("ambassador_id");



CREATE INDEX "idx_activities_status" ON "public"."activities" USING "btree" ("status");



CREATE INDEX "idx_ambassadors_referral_code" ON "public"."ambassadors" USING "btree" ("referral_code");



CREATE INDEX "idx_ambassadors_status" ON "public"."ambassadors" USING "btree" ("status");



CREATE INDEX "idx_ambassadors_user_id" ON "public"."ambassadors" USING "btree" ("user_id");



CREATE INDEX "idx_conversions_ambassador" ON "public"."conversions" USING "btree" ("ambassador_id");



CREATE INDEX "idx_conversions_lead" ON "public"."conversions" USING "btree" ("lead_id");



CREATE INDEX "idx_crm_audit_entity" ON "public"."crm_audit_logs" USING "btree" ("entity_type", "entity_id", "created_at");



CREATE INDEX "idx_crm_communications_identity" ON "public"."crm_communications" USING "btree" ("identity_id", "created_at");



CREATE INDEX "idx_crm_files_identity" ON "public"."crm_files" USING "btree" ("identity_id", "created_at");



CREATE INDEX "idx_crm_files_lead" ON "public"."crm_files" USING "btree" ("lead_id", "created_at");



CREATE INDEX "idx_crm_followups_status_due" ON "public"."crm_followups" USING "btree" ("status", "due_at");



CREATE INDEX "idx_crm_invoices_sale" ON "public"."crm_invoices" USING "btree" ("sale_id");



CREATE INDEX "idx_crm_notifications_identity" ON "public"."crm_notifications" USING "btree" ("identity_id", "created_at");



CREATE INDEX "idx_crm_notifications_status" ON "public"."crm_notifications" USING "btree" ("status", "created_at");



CREATE INDEX "idx_crm_quotes_identity" ON "public"."crm_quotes" USING "btree" ("identity_id", "created_at");



CREATE INDEX "idx_crm_quotes_lead" ON "public"."crm_quotes" USING "btree" ("lead_id", "created_at");



CREATE INDEX "idx_crm_receipts_sale" ON "public"."crm_receipts" USING "btree" ("sale_id");



CREATE INDEX "idx_crm_sales_identity" ON "public"."crm_sales" USING "btree" ("identity_id", "created_at");



CREATE INDEX "idx_crm_sales_lead" ON "public"."crm_sales" USING "btree" ("lead_id", "created_at");



CREATE INDEX "idx_identity_ambassador_conflicts_pending" ON "public"."identity_ambassador_conflicts" USING "btree" ("decision", "created_at");



CREATE INDEX "idx_identity_device" ON "public"."identity_signals" USING "btree" ("signal_value") WHERE ("signal_type" = 'device_signature'::"text");



CREATE INDEX "idx_identity_email" ON "public"."identity_signals" USING "btree" ("signal_value") WHERE ("signal_type" = 'email'::"text");



CREATE INDEX "idx_identity_phone" ON "public"."identity_signals" USING "btree" ("signal_value") WHERE ("signal_type" = 'phone'::"text");



CREATE INDEX "idx_identity_signal" ON "public"."identity_signals" USING "btree" ("signal_type", "signal_value");



CREATE INDEX "idx_identity_visitor" ON "public"."identity_signals" USING "btree" ("signal_value") WHERE ("signal_type" = 'visitor_id'::"text");



CREATE INDEX "idx_leads_ambassador" ON "public"."leads" USING "btree" ("ambassador_id");



CREATE INDEX "idx_leads_funnel_stage" ON "public"."leads" USING "btree" ("funnel_stage");



CREATE INDEX "idx_leads_source" ON "public"."leads" USING "btree" ("source");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_point_transactions_ambassador" ON "public"."point_transactions" USING "btree" ("ambassador_id");



CREATE INDEX "idx_point_transactions_type" ON "public"."point_transactions" USING "btree" ("type");



CREATE INDEX "idx_product_interests_identity" ON "public"."product_interests" USING "btree" ("identity_id", "created_at");



CREATE INDEX "idx_product_interests_product" ON "public"."product_interests" USING "btree" ("product_id", "created_at");



CREATE INDEX "idx_spin_cashout_requests_identity_id" ON "public"."spin_cashout_requests" USING "btree" ("identity_id");



CREATE INDEX "idx_spin_logs_identity_id" ON "public"."spin_logs" USING "btree" ("identity_id");



CREATE INDEX "idx_spin_logs_spin_player_id" ON "public"."spin_logs" USING "btree" ("spin_player_id");



CREATE INDEX "idx_spin_players_identity_id" ON "public"."spin_players" USING "btree" ("identity_id");



CREATE INDEX "idx_spin_players_old_spin_profile_id" ON "public"."spin_players" USING "btree" ("old_spin_profile_id");



CREATE INDEX "idx_spin_players_phone_number" ON "public"."spin_players" USING "btree" ("phone_number");



CREATE INDEX "idx_spin_players_referral_code" ON "public"."spin_players" USING "btree" ("referral_code");



CREATE INDEX "idx_spin_referral_awards_referred" ON "public"."spin_referral_awards" USING "btree" ("referred_spin_player_id");



CREATE INDEX "idx_spin_referral_awards_referrer" ON "public"."spin_referral_awards" USING "btree" ("referrer_spin_player_id");



CREATE INDEX "idx_spin_referrals_referred_identity_id" ON "public"."spin_referrals" USING "btree" ("referred_identity_id");



CREATE INDEX "idx_spin_referrals_referrer_identity_id" ON "public"."spin_referrals" USING "btree" ("referrer_identity_id");



CREATE INDEX "idx_spin_transactions_identity_id" ON "public"."spin_transactions" USING "btree" ("identity_id");



CREATE INDEX "lead_events_ambassador_id_idx" ON "public"."lead_events" USING "btree" ("ambassador_id");



CREATE INDEX "lead_events_event_type_idx" ON "public"."lead_events" USING "btree" ("event_type");



CREATE INDEX "lead_events_lead_id_idx" ON "public"."lead_events" USING "btree" ("lead_id");



CREATE INDEX "lead_signals_ambassador_signal_idx" ON "public"."lead_signals" USING "btree" ("ambassador_id", "signal_type", "signal_value");



CREATE INDEX "lead_signals_type_value" ON "public"."lead_signals" USING "btree" ("signal_type", "signal_value");



CREATE INDEX "leads_ambassador_intelligence_idx" ON "public"."leads" USING "btree" ("ambassador_id", "lead_intelligence_status", "needs_merge_review");



CREATE UNIQUE INDEX "leads_lead_code_unique" ON "public"."leads" USING "btree" ("lead_code");



CREATE INDEX "referral_clicks_lead_id_idx" ON "public"."referral_clicks" USING "btree" ("lead_id");



CREATE INDEX "referral_clicks_visitor_id_idx" ON "public"."referral_clicks" USING "btree" ("visitor_id");



CREATE INDEX "sms_leads_outreach_status_idx" ON "public"."sms_leads" USING "btree" ("whatsapp_outreach_status");



CREATE INDEX "sms_recipients_campaign_status_idx" ON "public"."sms_campaign_recipients" USING "btree" ("campaign_id", "sms_status");



CREATE INDEX "sms_recipients_tracking_token_idx" ON "public"."sms_campaign_recipients" USING "btree" ("tracking_token");



CREATE INDEX "spin_cash_challenge_credits_player_idx" ON "public"."spin_cash_challenge_credits" USING "btree" ("spin_player_id", "created_at" DESC);



CREATE INDEX "spin_cash_challenges_expiry_idx" ON "public"."spin_cash_challenges" USING "btree" ("status", "expires_at") WHERE ("status" = 'active'::"text");



CREATE INDEX "spin_cash_challenges_identity_idx" ON "public"."spin_cash_challenges" USING "btree" ("identity_id", "created_at" DESC);



CREATE UNIQUE INDEX "spin_cash_challenges_one_active_idx" ON "public"."spin_cash_challenges" USING "btree" ("spin_player_id") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "spin_logs_request_id_unique_idx" ON "public"."spin_logs" USING "btree" ("request_id") WHERE ("request_id" IS NOT NULL);



CREATE UNIQUE INDEX "spin_players_one_per_identity_idx" ON "public"."spin_players" USING "btree" ("identity_id") WHERE ("identity_id" IS NOT NULL);



CREATE UNIQUE INDEX "unique_lifetime_referral_lead" ON "public"."referral_clicks" USING "btree" ("ambassador_id", "visitor_fingerprint") WHERE ("counted_as_lead" = true);



CREATE UNIQUE INDEX "unique_pending_identity_match" ON "public"."identity_match_suggestions" USING "btree" ("identity_a", "identity_b") WHERE ("decision" = 'pending'::"text");



CREATE INDEX "website_events_product_created_idx" ON "public"."website_events" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "website_events_visitor_created_idx" ON "public"."website_events" USING "btree" ("visitor_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "cash_off_accounts_touch_updated_at" BEFORE UPDATE ON "public"."cash_off_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_cash_off_account_updated_at"();



CREATE OR REPLACE TRIGGER "invite_validation" BEFORE INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."validate_invite_code"();



CREATE OR REPLACE TRIGGER "payout_balance_update" AFTER UPDATE ON "public"."payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_ambassador_balance_on_payout"();



CREATE OR REPLACE TRIGGER "remove_ambassador_when_admin" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."remove_ambassador_on_admin"();



CREATE OR REPLACE TRIGGER "set_lead_code" BEFORE INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."generate_lead_code"();



CREATE OR REPLACE TRIGGER "sms_campaigns_set_updated_at" BEFORE UPDATE ON "public"."sms_campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."sms_set_updated_at"();



CREATE OR REPLACE TRIGGER "sms_leads_set_updated_at" BEFORE UPDATE ON "public"."sms_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sms_set_updated_at"();



CREATE OR REPLACE TRIGGER "sms_recipients_set_updated_at" BEFORE UPDATE ON "public"."sms_campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."sms_set_updated_at"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ambassador_bonuses"
    ADD CONSTRAINT "ambassador_bonuses_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."ambassador_bonuses"
    ADD CONSTRAINT "ambassador_bonuses_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ambassadors"
    ADD CONSTRAINT "ambassadors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."canonical_wheel_sessions"
    ADD CONSTRAINT "canonical_wheel_sessions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canonical_wheel_sessions"
    ADD CONSTRAINT "canonical_wheel_sessions_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_events"
    ADD CONSTRAINT "cart_events_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cart_events"
    ADD CONSTRAINT "cart_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_off_accounts"
    ADD CONSTRAINT "cash_off_accounts_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cash_off_source_balances"
    ADD CONSTRAINT "cash_off_source_balances_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cash_off_transactions"
    ADD CONSTRAINT "cash_off_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_off_transactions"
    ADD CONSTRAINT "cash_off_transactions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cash_off_transactions"
    ADD CONSTRAINT "cash_off_transactions_spin_log_id_fkey" FOREIGN KEY ("spin_log_id") REFERENCES "public"."spin_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversions"
    ADD CONSTRAINT "conversions_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversions"
    ADD CONSTRAINT "conversions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."conversions"
    ADD CONSTRAINT "conversions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_communications"
    ADD CONSTRAINT "crm_communications_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_communications"
    ADD CONSTRAINT "crm_communications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."crm_quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."crm_receipts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_files"
    ADD CONSTRAINT "crm_files_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."crm_sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_followups"
    ADD CONSTRAINT "crm_followups_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_followups"
    ADD CONSTRAINT "crm_followups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_funnel_events"
    ADD CONSTRAINT "crm_funnel_events_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_funnel_events"
    ADD CONSTRAINT "crm_funnel_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_invoices"
    ADD CONSTRAINT "crm_invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."crm_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notifications"
    ADD CONSTRAINT "crm_notifications_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_quote_items"
    ADD CONSTRAINT "crm_quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."crm_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_quote_items"
    ADD CONSTRAINT "crm_quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."crm_quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_quotes"
    ADD CONSTRAINT "crm_quotes_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_quotes"
    ADD CONSTRAINT "crm_quotes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_receipts"
    ADD CONSTRAINT "crm_receipts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."crm_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sale_items"
    ADD CONSTRAINT "crm_sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."crm_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_sale_items"
    ADD CONSTRAINT "crm_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."crm_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_sales"
    ADD CONSTRAINT "crm_sales_conversion_id_fkey" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_sales"
    ADD CONSTRAINT "crm_sales_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_sales"
    ADD CONSTRAINT "crm_sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_ambassador_conflicts"
    ADD CONSTRAINT "identity_ambassador_conflicts_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identity_ambassador_conflicts"
    ADD CONSTRAINT "identity_ambassador_conflicts_new_ambassador_id_fkey" FOREIGN KEY ("new_ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_ambassador_conflicts"
    ADD CONSTRAINT "identity_ambassador_conflicts_original_ambassador_id_fkey" FOREIGN KEY ("original_ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_events"
    ADD CONSTRAINT "identity_events_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identity_match_suggestions"
    ADD CONSTRAINT "identity_match_suggestions_identity_a_fkey" FOREIGN KEY ("identity_a") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identity_match_suggestions"
    ADD CONSTRAINT "identity_match_suggestions_identity_b_fkey" FOREIGN KEY ("identity_b") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identity_signals"
    ADD CONSTRAINT "identity_signals_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invite_links"
    ADD CONSTRAINT "invite_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_signals"
    ADD CONSTRAINT "lead_signals_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_signals"
    ADD CONSTRAINT "lead_signals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_admin_fkey" FOREIGN KEY ("assigned_admin") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_merged_into_lead_id_fkey" FOREIGN KEY ("merged_into_lead_id") REFERENCES "public"."leads"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_interests"
    ADD CONSTRAINT "product_interests_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_interests"
    ADD CONSTRAINT "product_interests_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_interests"
    ADD CONSTRAINT "product_interests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."crm_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_views"
    ADD CONSTRAINT "product_views_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_views"
    ADD CONSTRAINT "product_views_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_clicks"
    ADD CONSTRAINT "referral_clicks_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_clicks"
    ADD CONSTRAINT "referral_clicks_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_clicks"
    ADD CONSTRAINT "referral_clicks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sms_campaign_recipients"
    ADD CONSTRAINT "sms_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."sms_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sms_campaign_recipients"
    ADD CONSTRAINT "sms_campaign_recipients_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."sms_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_cash_challenge_credits"
    ADD CONSTRAINT "spin_cash_challenge_credits_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."spin_cash_challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_cash_challenge_credits"
    ADD CONSTRAINT "spin_cash_challenge_credits_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_cash_challenge_credits"
    ADD CONSTRAINT "spin_cash_challenge_credits_spin_log_id_fkey" FOREIGN KEY ("spin_log_id") REFERENCES "public"."spin_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_cash_challenge_credits"
    ADD CONSTRAINT "spin_cash_challenge_credits_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_cash_challenges"
    ADD CONSTRAINT "spin_cash_challenges_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_cash_challenges"
    ADD CONSTRAINT "spin_cash_challenges_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_cashout_requests"
    ADD CONSTRAINT "spin_cashout_requests_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_cashout_requests"
    ADD CONSTRAINT "spin_cashout_requests_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_dm_clicks"
    ADD CONSTRAINT "spin_dm_clicks_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_dm_clicks"
    ADD CONSTRAINT "spin_dm_clicks_spin_log_id_fkey" FOREIGN KEY ("spin_log_id") REFERENCES "public"."spin_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_dm_clicks"
    ADD CONSTRAINT "spin_dm_clicks_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_cash_challenge_id_fkey" FOREIGN KEY ("cash_challenge_id") REFERENCES "public"."spin_cash_challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_cash_off_transaction_id_fkey" FOREIGN KEY ("cash_off_transaction_id") REFERENCES "public"."cash_off_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "public"."spin_prizes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_logs"
    ADD CONSTRAINT "spin_logs_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_players"
    ADD CONSTRAINT "spin_players_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_players"
    ADD CONSTRAINT "spin_players_referred_by_identity_id_fkey" FOREIGN KEY ("referred_by_identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_referral_awards"
    ADD CONSTRAINT "spin_referral_awards_referred_identity_id_fkey" FOREIGN KEY ("referred_identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_referral_awards"
    ADD CONSTRAINT "spin_referral_awards_referred_spin_player_id_fkey" FOREIGN KEY ("referred_spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_referral_awards"
    ADD CONSTRAINT "spin_referral_awards_referrer_identity_id_fkey" FOREIGN KEY ("referrer_identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_referral_awards"
    ADD CONSTRAINT "spin_referral_awards_referrer_spin_player_id_fkey" FOREIGN KEY ("referrer_spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_referrals"
    ADD CONSTRAINT "spin_referrals_referred_identity_id_fkey" FOREIGN KEY ("referred_identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_referrals"
    ADD CONSTRAINT "spin_referrals_referred_spin_player_id_fkey" FOREIGN KEY ("referred_spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_referrals"
    ADD CONSTRAINT "spin_referrals_referrer_identity_id_fkey" FOREIGN KEY ("referrer_identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_referrals"
    ADD CONSTRAINT "spin_referrals_referrer_spin_player_id_fkey" FOREIGN KEY ("referrer_spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_rule_items"
    ADD CONSTRAINT "spin_rule_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."spin_rule_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spin_transactions"
    ADD CONSTRAINT "spin_transactions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_transactions"
    ADD CONSTRAINT "spin_transactions_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_prizes"
    ADD CONSTRAINT "spin_user_prizes_cash_off_transaction_id_fkey" FOREIGN KEY ("cash_off_transaction_id") REFERENCES "public"."cash_off_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_prizes"
    ADD CONSTRAINT "spin_user_prizes_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_prizes"
    ADD CONSTRAINT "spin_user_prizes_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "public"."spin_prizes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_prizes"
    ADD CONSTRAINT "spin_user_prizes_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_rule_usage"
    ADD CONSTRAINT "spin_user_rule_usage_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_rule_usage"
    ADD CONSTRAINT "spin_user_rule_usage_spin_player_id_fkey" FOREIGN KEY ("spin_player_id") REFERENCES "public"."spin_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spin_user_rule_usage"
    ADD CONSTRAINT "spin_user_rule_usage_spin_rule_item_id_fkey" FOREIGN KEY ("spin_rule_item_id") REFERENCES "public"."spin_rule_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor_sessions"
    ADD CONSTRAINT "visitor_sessions_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."website_events"
    ADD CONSTRAINT "website_events_ambassador_id_fkey" FOREIGN KEY ("ambassador_id") REFERENCES "public"."ambassadors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."website_events"
    ADD CONSTRAINT "website_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."website_wheel_handoffs"
    ADD CONSTRAINT "website_wheel_handoffs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can insert app settings" ON "public"."app_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert point transactions" ON "public"."point_transactions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage product categories" ON "public"."product_categories" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage product images" ON "public"."product_images" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage products" ON "public"."products" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read app settings" ON "public"."app_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read referral clicks" ON "public"."referral_clicks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update app settings" ON "public"."app_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage activities" ON "public"."activities" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage ambassadors" ON "public"."ambassadors" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage conversions" ON "public"."conversions" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage invites" ON "public"."invite_links" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage leads" ON "public"."leads" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage payouts" ON "public"."payouts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins view all transactions" ON "public"."point_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"text")))));



CREATE POLICY "Admins view all users" ON "public"."users" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Allow public read access" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "Ambassadors can update own profile" ON "public"."ambassadors" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Ambassadors create activities" ON "public"."activities" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ambassadors"
  WHERE (("ambassadors"."id" = "activities"."ambassador_id") AND ("ambassadors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Ambassadors view own" ON "public"."ambassadors" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Ambassadors view own activities" ON "public"."activities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ambassadors"
  WHERE (("ambassadors"."id" = "activities"."ambassador_id") AND ("ambassadors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Ambassadors view own conversions" ON "public"."conversions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ambassadors"
  WHERE (("ambassadors"."id" = "conversions"."ambassador_id") AND ("ambassadors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Ambassadors view own leads" ON "public"."leads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ambassadors"
  WHERE (("ambassadors"."id" = "leads"."ambassador_id") AND ("ambassadors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Ambassadors view own payouts" ON "public"."payouts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ambassadors"
  WHERE (("ambassadors"."id" = "payouts"."ambassador_id") AND ("ambassadors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Ambassadors view own transactions" ON "public"."point_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ambassadors"
  WHERE (("ambassadors"."id" = "point_transactions"."ambassador_id") AND ("ambassadors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Anon can read active ambassador referral codes" ON "public"."ambassadors" FOR SELECT TO "anon" USING (("status" = 'active'::"text"));



CREATE POLICY "Anyone can validate active invite links" ON "public"."invite_links" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "Authenticated users can view leaderboard ambassadors" ON "public"."ambassadors" FOR SELECT TO "authenticated" USING (("status" = 'active'::"text"));



CREATE POLICY "Authenticated users can view leaderboard user names" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can view active products" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING (("status" = 'active'::"text"));



CREATE POLICY "Public can view product categories" ON "public"."product_categories" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can view product images" ON "public"."product_images" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Users update own" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users view own" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ambassadors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canonical_wheel_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cart_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_off_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_off_admin_read_accounts" ON "public"."cash_off_accounts" FOR SELECT TO "authenticated" USING ("public"."is_cash_off_admin"());



CREATE POLICY "cash_off_admin_read_sources" ON "public"."cash_off_source_balances" FOR SELECT TO "authenticated" USING ("public"."is_cash_off_admin"());



CREATE POLICY "cash_off_admin_read_transactions" ON "public"."cash_off_transactions" FOR SELECT TO "authenticated" USING ("public"."is_cash_off_admin"());



ALTER TABLE "public"."cash_off_source_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_off_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invite_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."point_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_clicks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sms dashboard insert campaigns" ON "public"."sms_campaigns" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "sms dashboard insert recipients" ON "public"."sms_campaign_recipients" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "sms dashboard read campaigns" ON "public"."sms_campaigns" FOR SELECT TO "anon" USING (true);



CREATE POLICY "sms dashboard read leads" ON "public"."sms_leads" FOR SELECT TO "anon" USING (true);



CREATE POLICY "sms dashboard read recipients" ON "public"."sms_campaign_recipients" FOR SELECT TO "anon" USING (true);



CREATE POLICY "sms dashboard update campaigns" ON "public"."sms_campaigns" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "sms dashboard update leads" ON "public"."sms_leads" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "sms dashboard update recipients" ON "public"."sms_campaign_recipients" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sms_campaign_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sms_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sms_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spin_cash_challenge_credits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spin_cash_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visitor_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_wheel_handoffs" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_commission_to_conversion"("p_admin_id" "uuid", "p_conversion_id" "uuid", "p_commission_percentage" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."add_commission_to_conversion"("p_admin_id" "uuid", "p_conversion_id" "uuid", "p_commission_percentage" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_commission_to_conversion"("p_admin_id" "uuid", "p_conversion_id" "uuid", "p_commission_percentage" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."add_quote_item"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_product_id" "uuid", "p_item_name" "text", "p_description" "text", "p_quantity" integer, "p_unit_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."add_quote_item"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_product_id" "uuid", "p_item_name" "text", "p_description" "text", "p_quantity" integer, "p_unit_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_quote_item"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_product_id" "uuid", "p_item_name" "text", "p_description" "text", "p_quantity" integer, "p_unit_price" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_spin_cash_challenge_win"("p_spin_player_id" "uuid", "p_amount" numeric, "p_spin_log_id" "uuid", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_spin_cash_challenge_win"("p_spin_player_id" "uuid", "p_amount" numeric, "p_spin_log_id" "uuid", "p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_add_ambassador_bonus"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_amount" numeric, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_add_ambassador_bonus"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_amount" numeric, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_add_ambassador_bonus"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_amount" numeric, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_adjust_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_adjust_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_create_conversion"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_amount" numeric, "p_commission_percentage" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_conversion"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_amount" numeric, "p_commission_percentage" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_conversion"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_amount" numeric, "p_commission_percentage" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_create_lead"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_source" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_lead"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_source" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_lead"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_source" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_enrich_lead_after_update"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_enrich_lead_after_update"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_enrich_lead_after_update"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_activity"("p_activity_id" "uuid", "p_admin_id" "uuid", "p_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."approve_activity"("p_activity_id" "uuid", "p_admin_id" "uuid", "p_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_activity"("p_activity_id" "uuid", "p_admin_id" "uuid", "p_points" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_conversion"("p_lead_id" "uuid", "p_admin_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."approve_conversion"("p_lead_id" "uuid", "p_admin_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_conversion"("p_lead_id" "uuid", "p_admin_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_identity_match_merge"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_primary_identity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_identity_match_merge"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_primary_identity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_identity_match_merge"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_primary_identity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."attach_crm_file"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_sale_id" "uuid", "p_quote_id" "uuid", "p_invoice_id" "uuid", "p_receipt_id" "uuid", "p_file_name" "text", "p_file_url" "text", "p_file_type" "text", "p_file_size" bigint, "p_category" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."attach_crm_file"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_sale_id" "uuid", "p_quote_id" "uuid", "p_invoice_id" "uuid", "p_receipt_id" "uuid", "p_file_name" "text", "p_file_url" "text", "p_file_type" "text", "p_file_size" bigint, "p_category" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."attach_crm_file"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_sale_id" "uuid", "p_quote_id" "uuid", "p_invoice_id" "uuid", "p_receipt_id" "uuid", "p_file_name" "text", "p_file_url" "text", "p_file_type" "text", "p_file_size" bigint, "p_category" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_points"("p_ambassador_id" "uuid", "p_amount" integer, "p_type" "text", "p_reference_id" "uuid", "p_reference_type" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."award_points"("p_ambassador_id" "uuid", "p_amount" integer, "p_type" "text", "p_reference_id" "uuid", "p_reference_type" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_points"("p_ambassador_id" "uuid", "p_amount" integer, "p_type" "text", "p_reference_id" "uuid", "p_reference_type" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_spin_referral"("p_referral_code" "text", "p_referred_spin_player_id" "uuid", "p_referred_identity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."award_spin_referral"("p_referral_code" "text", "p_referred_spin_player_id" "uuid", "p_referred_identity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_spin_referral"("p_referral_code" "text", "p_referred_spin_player_id" "uuid", "p_referred_identity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_lead_identities"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_lead_identities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_lead_identities"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_canonical_wheel_visitor"("p_visitor_id" "text", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_referral_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_canonical_wheel_visitor"("p_visitor_id" "text", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_referral_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_canonical_wheel_visitor"("p_visitor_id" "text", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_referral_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_canonical_wheel_visitor"("p_visitor_id" "text", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_referral_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."canonical_wheel_session_player"("p_session_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canonical_wheel_session_player"("p_session_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cash_off_apply_transaction"("p_identity_id" "uuid", "p_direction" "text", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cash_off_apply_transaction"("p_identity_id" "uuid", "p_direction" "text", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_canonical_wheel_spin"("p_session_token" "text", "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_canonical_wheel_spin"("p_session_token" "text", "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_canonical_wheel_spin"("p_session_token" "text", "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_canonical_wheel_spin"("p_session_token" "text", "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_cash_challenge_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_cash_challenge_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_cash_off_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_cash_off_spin"("p_spin_player_id" "uuid", "p_rule_item_id" "uuid", "p_expected_spin_number" integer, "p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_crm_followup"("p_admin_id" "uuid", "p_followup_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_crm_followup"("p_admin_id" "uuid", "p_followup_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_crm_followup"("p_admin_id" "uuid", "p_followup_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_website_wheel_handoff"("p_handoff_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_website_wheel_handoff"("p_handoff_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_website_wheel_handoff"("p_handoff_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_website_wheel_handoff"("p_handoff_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_website_wheel_handoff_once"("p_handoff_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_website_wheel_handoff_once"("p_handoff_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_quote_to_sale"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_create_invoice" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_quote_to_sale"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_create_invoice" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_quote_to_sale"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_create_invoice" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_crm_followup"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_crm_followup"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_crm_followup"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_title" "text", "p_description" "text", "p_due_at" timestamp with time zone, "p_priority" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_crm_notification"("p_type" "text", "p_title" "text", "p_message" "text", "p_related_entity_type" "text", "p_related_entity_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_priority" "text", "p_created_for" "uuid", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_crm_notification"("p_type" "text", "p_title" "text", "p_message" "text", "p_related_entity_type" "text", "p_related_entity_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_priority" "text", "p_created_for" "uuid", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_crm_notification"("p_type" "text", "p_title" "text", "p_message" "text", "p_related_entity_type" "text", "p_related_entity_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_priority" "text", "p_created_for" "uuid", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_crm_quote"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_valid_until" "date", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_crm_quote"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_valid_until" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_crm_quote"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_valid_until" "date", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_crm_sale"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_total_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_crm_sale"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_total_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_crm_sale"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_total_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_invoice_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_due_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_invoice_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_due_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invoice_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_due_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_quote_lead"("p_visitor_id" "text", "p_product_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_notes" "text", "p_source_page" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_quote_lead"("p_visitor_id" "text", "p_product_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_notes" "text", "p_source_page" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_quote_lead"("p_visitor_id" "text", "p_product_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_email" "text", "p_notes" "text", "p_source_page" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_receipt_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_payment_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_receipt_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_payment_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_receipt_for_sale"("p_admin_id" "uuid", "p_sale_id" "uuid", "p_amount" numeric, "p_payment_method" "text", "p_payment_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_website_wheel_handoff"("p_visitor_id" "text", "p_product_id" "uuid", "p_source_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_website_wheel_handoff"("p_visitor_id" "text", "p_product_id" "uuid", "p_source_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_website_wheel_handoff"("p_visitor_id" "text", "p_product_id" "uuid", "p_source_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_website_wheel_handoff"("p_visitor_id" "text", "p_product_id" "uuid", "p_source_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."credit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."credit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."debit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debit_cash_off"("p_identity_id" "uuid", "p_amount" numeric, "p_transaction_type" "text", "p_source_system" "text", "p_source_reference" "text", "p_order_reference" "text", "p_spin_log_id" "uuid", "p_created_by" "uuid", "p_reason" "text", "p_metadata" "jsonb", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_identity_ambassador_conflict"("p_identity_id" "uuid", "p_new_ambassador_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."detect_identity_ambassador_conflict"("p_identity_id" "uuid", "p_new_ambassador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_identity_ambassador_conflict"("p_identity_id" "uuid", "p_new_ambassador_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enrich_identity_from_lead"("p_lead_id" "uuid", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."enrich_identity_from_lead"("p_lead_id" "uuid", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enrich_identity_from_lead"("p_lead_id" "uuid", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_best_identity_match"("p_signals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."find_best_identity_match"("p_signals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_best_identity_match"("p_signals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_identity_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_identity_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_existing_referral_lead"("p_ambassador_id" "uuid", "p_identity_id" "uuid", "p_visitor_id" "text", "p_ip_signature" "text", "p_device_signature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ambassador_assets"("user_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ambassador_assets"("user_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ambassador_assets"("user_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_identity_match_suggestions"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_identity_match_suggestions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_identity_match_suggestions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invite_link"("p_admin_id" "uuid", "p_max_uses" integer, "p_expiry_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_link"("p_admin_id" "uuid", "p_max_uses" integer, "p_expiry_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_link"("p_admin_id" "uuid", "p_max_uses" integer, "p_expiry_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_lead_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_lead_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_lead_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_canonical_wheel_state"("p_session_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_canonical_wheel_state"("p_session_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_canonical_wheel_state"("p_session_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_canonical_wheel_state"("p_session_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cash_off_balance"("p_identity_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cash_off_balance"("p_identity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_crm_activity_feed"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_crm_activity_feed"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_crm_activity_feed"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_crm_dashboard_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_crm_dashboard_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_crm_dashboard_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_crm_funnel_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_crm_funnel_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_crm_funnel_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_journey_summary"("p_identity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_journey_summary"("p_identity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_journey_summary"("p_identity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity_files"("p_identity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity_files"("p_identity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity_files"("p_identity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_identity_timeline"("p_identity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity_timeline"("p_identity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity_timeline"("p_identity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_overdue_followups"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_overdue_followups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overdue_followups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_customer_identities"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_customer_identities"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_customer_identities"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_crm_notifications"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_crm_notifications"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_crm_notifications"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_invite_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_invite_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_invite_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hard_delete_ambassador"("p_ambassador_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."hard_delete_ambassador"("p_ambassador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hard_delete_ambassador"("p_ambassador_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."import_sms_outreach_labels"("p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."import_sms_outreach_labels"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_sms_outreach_labels"("p_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_cash_off_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_cash_off_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_cash_off_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_canonical_wheel_session"("p_visitor_id" "text", "p_identity_id" "uuid", "p_spin_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_canonical_wheel_session"("p_visitor_id" "text", "p_identity_id" "uuid", "p_spin_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."keep_identities_separate"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."keep_identities_separate"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."keep_identities_separate"("p_admin_id" "uuid", "p_suggestion_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_crm_communication"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_channel" "text", "p_direction" "text", "p_subject" "text", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_crm_communication"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_channel" "text", "p_direction" "text", "p_subject" "text", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_crm_communication"("p_admin_id" "uuid", "p_identity_id" "uuid", "p_lead_id" "uuid", "p_channel" "text", "p_direction" "text", "p_subject" "text", "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_crm_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_crm_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_crm_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_invoice_sent"("p_admin_id" "uuid", "p_invoice_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_invoice_sent"("p_admin_id" "uuid", "p_invoice_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_invoice_sent"("p_admin_id" "uuid", "p_invoice_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_receipt_sent"("p_admin_id" "uuid", "p_receipt_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_receipt_sent"("p_admin_id" "uuid", "p_receipt_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_receipt_sent"("p_admin_id" "uuid", "p_receipt_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_identities"("p_admin_id" "uuid", "p_primary_identity_id" "uuid", "p_duplicate_identity_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_identities"("p_admin_id" "uuid", "p_primary_identity_id" "uuid", "p_duplicate_identity_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_identities"("p_admin_id" "uuid", "p_primary_identity_id" "uuid", "p_duplicate_identity_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_lead_funnel_stage"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_new_stage" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."move_lead_funnel_stage"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_new_stage" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_lead_funnel_stage"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_new_stage" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_ng_phone"("raw_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_ng_phone"("raw_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_ng_phone"("raw_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prepare_sms_campaign_recipients"("p_campaign_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."prepare_sms_campaign_recipients"("p_campaign_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prepare_sms_campaign_recipients"("p_campaign_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_payout"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_points_paid" integer, "p_amount" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_payout"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_points_paid" integer, "p_amount" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_payout"("p_admin_id" "uuid", "p_ambassador_id" "uuid", "p_points_paid" integer, "p_amount" numeric, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_spin_cash_challenge"("p_spin_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_spin_cash_challenge"("p_spin_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_product_interest"("p_identity_id" "uuid", "p_lead_id" "uuid", "p_product_id" "uuid", "p_interest_type" "text", "p_source" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_product_interest"("p_identity_id" "uuid", "p_lead_id" "uuid", "p_product_id" "uuid", "p_interest_type" "text", "p_source" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_product_interest"("p_identity_id" "uuid", "p_lead_id" "uuid", "p_product_id" "uuid", "p_interest_type" "text", "p_source" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_sms_campaign_click"("p_tracking_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_sms_campaign_click"("p_tracking_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_sms_campaign_click"("p_tracking_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_sms_leads_from_spin_players"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_sms_leads_from_spin_players"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_sms_leads_from_spin_players"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_visitor_session"("p_visitor_id" "text", "p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."register_visitor_session"("p_visitor_id" "text", "p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_visitor_session"("p_visitor_id" "text", "p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_lead_edit_request"("p_admin_id" "uuid", "p_lead_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_lead_for_ambassador"("p_admin_id" "uuid", "p_lead_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_ambassador_on_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."remove_ambassador_on_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_ambassador_on_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_lead_edit"("p_lead_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_lead_edit"("p_lead_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_lead_edit"("p_lead_id" "uuid", "p_ambassador_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_conversion_no_commission"("p_admin_id" "uuid", "p_conversion_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_conversion_no_commission"("p_admin_id" "uuid", "p_conversion_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_conversion_no_commission"("p_admin_id" "uuid", "p_conversion_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_identity_ambassador_conflict"("p_admin_id" "uuid", "p_conflict_id" "uuid", "p_decision" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_identity_ambassador_conflict"("p_admin_id" "uuid", "p_conflict_id" "uuid", "p_decision" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_identity_ambassador_conflict"("p_admin_id" "uuid", "p_conflict_id" "uuid", "p_decision" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_crm_identities"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_crm_identities"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_crm_identities"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_custom_referral_code"("p_ambassador_id" "uuid", "p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_custom_referral_code"("p_ambassador_id" "uuid", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_custom_referral_code"("p_ambassador_id" "uuid", "p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sms_dashboard_summary"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sms_dashboard_summary"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sms_dashboard_summary"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sms_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."sms_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sms_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."spin_cash_challenge_payload"("p_spin_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."spin_cash_challenge_payload"("p_spin_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_all_spin_wallets_to_cash_off"("p_source_system" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_all_spin_wallets_to_cash_off"("p_source_system" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_spin_player_wallet_to_cash_off"("p_spin_player_id" "uuid", "p_source_system" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_spin_player_wallet_to_cash_off"("p_spin_player_id" "uuid", "p_source_system" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_cash_off_account_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_cash_off_account_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_cash_off_account_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_product_event"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_product_event"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."track_product_event"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_product_event"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_product_event_legacy"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_product_event_legacy"("p_visitor_id" "text", "p_product_id" "uuid", "p_event_type" "text", "p_quantity" integer, "p_source_page" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."track_whatsapp_referral_click"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."track_whatsapp_referral_click"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_whatsapp_referral_click"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."track_whatsapp_referral_click_v2"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text", "p_visitor_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."track_whatsapp_referral_click_v2"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text", "p_visitor_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_whatsapp_referral_click_v2"("p_referral_code" "text", "p_ip_address" "text", "p_user_agent" "text", "p_visitor_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ambassador_balance_on_payout"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ambassador_balance_on_payout"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ambassador_balance_on_payout"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quote_status"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_quote_status"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quote_status"("p_admin_id" "uuid", "p_quote_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_identity_from_signals"("p_signals" "jsonb", "p_primary_name" "text", "p_primary_phone" "text", "p_primary_email" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_identity_from_signals"("p_signals" "jsonb", "p_primary_name" "text", "p_primary_phone" "text", "p_primary_email" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_identity_from_signals"("p_signals" "jsonb", "p_primary_name" "text", "p_primary_phone" "text", "p_primary_email" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_invite_code"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notifications" TO "anon";
GRANT ALL ON TABLE "public"."admin_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."ambassador_bonuses" TO "anon";
GRANT ALL ON TABLE "public"."ambassador_bonuses" TO "authenticated";
GRANT ALL ON TABLE "public"."ambassador_bonuses" TO "service_role";



GRANT ALL ON TABLE "public"."ambassadors" TO "anon";
GRANT ALL ON TABLE "public"."ambassadors" TO "authenticated";
GRANT ALL ON TABLE "public"."ambassadors" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."canonical_wheel_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."cart_events" TO "anon";
GRANT ALL ON TABLE "public"."cart_events" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_events" TO "service_role";



GRANT ALL ON TABLE "public"."cash_off_accounts" TO "service_role";
GRANT SELECT ON TABLE "public"."cash_off_accounts" TO "authenticated";



GRANT ALL ON TABLE "public"."cash_off_source_balances" TO "service_role";
GRANT SELECT ON TABLE "public"."cash_off_source_balances" TO "authenticated";



GRANT ALL ON TABLE "public"."cash_off_transactions" TO "service_role";
GRANT SELECT ON TABLE "public"."cash_off_transactions" TO "authenticated";



GRANT ALL ON TABLE "public"."conversation_message_bank" TO "anon";
GRANT ALL ON TABLE "public"."conversation_message_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_message_bank" TO "service_role";



GRANT ALL ON TABLE "public"."conversions" TO "anon";
GRANT ALL ON TABLE "public"."conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."conversions" TO "service_role";



GRANT ALL ON TABLE "public"."crm_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."crm_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."crm_communications" TO "anon";
GRANT ALL ON TABLE "public"."crm_communications" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_communications" TO "service_role";



GRANT ALL ON TABLE "public"."crm_files" TO "anon";
GRANT ALL ON TABLE "public"."crm_files" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_files" TO "service_role";



GRANT ALL ON TABLE "public"."crm_followups" TO "anon";
GRANT ALL ON TABLE "public"."crm_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_followups" TO "service_role";



GRANT ALL ON TABLE "public"."crm_funnel_events" TO "anon";
GRANT ALL ON TABLE "public"."crm_funnel_events" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_funnel_events" TO "service_role";



GRANT ALL ON TABLE "public"."crm_funnel_stages" TO "anon";
GRANT ALL ON TABLE "public"."crm_funnel_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_funnel_stages" TO "service_role";



GRANT ALL ON TABLE "public"."crm_invoices" TO "anon";
GRANT ALL ON TABLE "public"."crm_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."crm_notifications" TO "anon";
GRANT ALL ON TABLE "public"."crm_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."crm_products" TO "anon";
GRANT ALL ON TABLE "public"."crm_products" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_products" TO "service_role";



GRANT ALL ON TABLE "public"."crm_quote_items" TO "anon";
GRANT ALL ON TABLE "public"."crm_quote_items" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_quote_items" TO "service_role";



GRANT ALL ON TABLE "public"."crm_quotes" TO "anon";
GRANT ALL ON TABLE "public"."crm_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."crm_receipts" TO "anon";
GRANT ALL ON TABLE "public"."crm_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."crm_sale_items" TO "anon";
GRANT ALL ON TABLE "public"."crm_sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."crm_sales" TO "anon";
GRANT ALL ON TABLE "public"."crm_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_sales" TO "service_role";



GRANT ALL ON TABLE "public"."identities" TO "anon";
GRANT ALL ON TABLE "public"."identities" TO "authenticated";
GRANT ALL ON TABLE "public"."identities" TO "service_role";



GRANT ALL ON TABLE "public"."identity_ambassador_conflicts" TO "anon";
GRANT ALL ON TABLE "public"."identity_ambassador_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_ambassador_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."identity_events" TO "anon";
GRANT ALL ON TABLE "public"."identity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_events" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."identity_lifetime_value" TO "anon";
GRANT ALL ON TABLE "public"."identity_lifetime_value" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_lifetime_value" TO "service_role";



GRANT ALL ON TABLE "public"."identity_match_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."identity_match_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_match_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."identity_signal_weights" TO "anon";
GRANT ALL ON TABLE "public"."identity_signal_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_signal_weights" TO "service_role";



GRANT ALL ON TABLE "public"."identity_signals" TO "anon";
GRANT ALL ON TABLE "public"."identity_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_signals" TO "service_role";



GRANT ALL ON TABLE "public"."invite_links" TO "anon";
GRANT ALL ON TABLE "public"."invite_links" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_links" TO "service_role";



GRANT ALL ON TABLE "public"."lead_events" TO "anon";
GRANT ALL ON TABLE "public"."lead_events" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_events" TO "service_role";



GRANT ALL ON TABLE "public"."lead_signals" TO "anon";
GRANT ALL ON TABLE "public"."lead_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_signals" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



GRANT ALL ON TABLE "public"."point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."point_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON TABLE "public"."product_images" TO "anon";
GRANT ALL ON TABLE "public"."product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."product_images" TO "service_role";



GRANT ALL ON TABLE "public"."product_interests" TO "anon";
GRANT ALL ON TABLE "public"."product_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."product_interests" TO "service_role";



GRANT ALL ON TABLE "public"."product_views" TO "anon";
GRANT ALL ON TABLE "public"."product_views" TO "authenticated";
GRANT ALL ON TABLE "public"."product_views" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."referral_clicks" TO "anon";
GRANT ALL ON TABLE "public"."referral_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."referral_route_logs" TO "anon";
GRANT ALL ON TABLE "public"."referral_route_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_route_logs" TO "service_role";



GRANT ALL ON TABLE "public"."sms_campaign_recipients" TO "anon";
GRANT ALL ON TABLE "public"."sms_campaign_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_campaign_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."sms_leads" TO "anon";
GRANT ALL ON TABLE "public"."sms_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_leads" TO "service_role";



GRANT ALL ON TABLE "public"."sms_campaign_recipient_details" TO "anon";
GRANT ALL ON TABLE "public"."sms_campaign_recipient_details" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_campaign_recipient_details" TO "service_role";



GRANT ALL ON TABLE "public"."sms_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."sms_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."spin_cash_challenge_credits" TO "service_role";



GRANT ALL ON TABLE "public"."spin_cash_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."spin_cashout_requests" TO "anon";
GRANT ALL ON TABLE "public"."spin_cashout_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_cashout_requests" TO "service_role";



GRANT ALL ON TABLE "public"."spin_dm_clicks" TO "anon";
GRANT ALL ON TABLE "public"."spin_dm_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_dm_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."spin_game_settings" TO "anon";
GRANT ALL ON TABLE "public"."spin_game_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_game_settings" TO "service_role";



GRANT ALL ON TABLE "public"."spin_letter_segments" TO "anon";
GRANT ALL ON TABLE "public"."spin_letter_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_letter_segments" TO "service_role";



GRANT ALL ON TABLE "public"."spin_logs" TO "anon";
GRANT ALL ON TABLE "public"."spin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."spin_players" TO "anon";
GRANT ALL ON TABLE "public"."spin_players" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_players" TO "service_role";



GRANT ALL ON TABLE "public"."spin_prizes" TO "anon";
GRANT ALL ON TABLE "public"."spin_prizes" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_prizes" TO "service_role";



GRANT ALL ON TABLE "public"."spin_referral_awards" TO "anon";
GRANT ALL ON TABLE "public"."spin_referral_awards" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_referral_awards" TO "service_role";



GRANT ALL ON TABLE "public"."spin_referrals" TO "anon";
GRANT ALL ON TABLE "public"."spin_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."spin_rule_groups" TO "anon";
GRANT ALL ON TABLE "public"."spin_rule_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_rule_groups" TO "service_role";



GRANT ALL ON TABLE "public"."spin_rule_items" TO "anon";
GRANT ALL ON TABLE "public"."spin_rule_items" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_rule_items" TO "service_role";



GRANT ALL ON TABLE "public"."spin_transactions" TO "anon";
GRANT ALL ON TABLE "public"."spin_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."spin_user_prizes" TO "anon";
GRANT ALL ON TABLE "public"."spin_user_prizes" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_user_prizes" TO "service_role";



GRANT ALL ON TABLE "public"."spin_user_rule_usage" TO "anon";
GRANT ALL ON TABLE "public"."spin_user_rule_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."spin_user_rule_usage" TO "service_role";



GRANT ALL ON TABLE "public"."visitor_sessions" TO "anon";
GRANT ALL ON TABLE "public"."visitor_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."visitor_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."website_events" TO "service_role";



GRANT ALL ON TABLE "public"."website_wheel_handoffs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







