-- Ambassador-submitted leads require Admin approval. Admin-created leads are
-- trusted and approved immediately. All authorization is enforced in SQL.

create unique index if not exists leads_ambassador_submission_key_unique
  on public.leads ((source_detail ->> 'submission_key'))
  where lead_type = 'ambassador_submission'
    and source_detail ->> 'submission_key' is not null;

alter table public.ambassador_notifications
  drop constraint if exists ambassador_notifications_type_check;

alter table public.ambassador_notifications
  add constraint ambassador_notifications_type_check
  check (type in ('previously_referred', 'lead_credited', 'lead_approved', 'lead_rejected'));

create or replace function public.submit_ambassador_lead(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_interest text default null,
  p_notes text default null,
  p_submission_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ambassador public.ambassadors%rowtype;
  v_lead_id uuid;
  v_existing_id uuid;
  v_duplicate_id uuid;
  v_phone text;
  v_email text := nullif(lower(trim(p_customer_email)), '');
  v_submission_key text := nullif(trim(p_submission_key), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_ambassador
  from public.ambassadors
  where user_id = v_user_id
    and status = 'active'
  limit 1;

  if v_ambassador.id is null then
    raise exception 'An active Ambassador account is required';
  end if;

  if nullif(trim(p_customer_name), '') is null then
    raise exception 'Customer name is required';
  end if;

  if nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer phone is required';
  end if;

  if v_submission_key is null or length(v_submission_key) > 100 then
    raise exception 'A valid submission key is required';
  end if;

  select id into v_existing_id
  from public.leads
  where lead_type = 'ambassador_submission'
    and source_detail ->> 'submission_key' = v_submission_key
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'lead_id', v_existing_id,
      'status', 'pending',
      'duplicate_submission', true
    );
  end if;

  v_phone := coalesce(
    public.normalize_contact_phone(p_customer_phone),
    trim(p_customer_phone)
  );

  select l.id into v_duplicate_id
  from public.leads l
  where l.merged_into_lead_id is null
    and (
      public.normalize_contact_phone(l.customer_phone) = v_phone
      or (v_email is not null and lower(l.customer_email) = v_email)
    )
  order by l.created_at asc
  limit 1;

  insert into public.leads (
    ambassador_id,
    source,
    source_detail,
    customer_name,
    customer_phone,
    customer_email,
    status,
    notes,
    lead_type,
    funnel_stage,
    lead_approval_status,
    approved_as_lead,
    duplicate_status,
    needs_merge_review,
    click_count,
    last_clicked_at,
    created_at,
    updated_at
  ) values (
    v_ambassador.id,
    'direct',
    jsonb_strip_nulls(jsonb_build_object(
      'channel', 'ambassador_manual_submission',
      'submission_key', v_submission_key,
      'submitted_by_user_id', v_user_id,
      'interest', nullif(trim(p_interest), ''),
      'possible_duplicate_lead_id', v_duplicate_id
    )),
    trim(p_customer_name),
    v_phone,
    v_email,
    'new',
    nullif(trim(p_notes), ''),
    'ambassador_submission',
    'new_lead',
    'pending',
    false,
    case when v_duplicate_id is null then 'unique' else 'possible_duplicate' end,
    v_duplicate_id is not null,
    1,
    now(),
    now(),
    now()
  ) returning id into v_lead_id;

  insert into public.lead_events (
    lead_id, ambassador_id, event_type, event_title,
    event_description, event_data, created_by
  ) values (
    v_lead_id,
    v_ambassador.id,
    'lead_submitted_for_approval',
    'Lead submitted for approval',
    'Ambassador manually submitted a lead for Admin review.',
    jsonb_build_object(
      'possible_duplicate_lead_id', v_duplicate_id,
      'interest', nullif(trim(p_interest), '')
    ),
    v_user_id
  );

  insert into public.admin_notifications (
    type, title, message, related_table, related_id,
    ambassador_id, lead_id, is_read, created_at
  ) values (
    'lead_approval_required',
    case when v_duplicate_id is null
      then 'Ambassador lead awaiting approval'
      else 'Possible duplicate lead awaiting review'
    end,
    case when v_duplicate_id is null
      then v_ambassador.display_name || ' submitted a new lead.'
      else v_ambassador.display_name || ' submitted a lead that may match an existing customer.'
    end,
    'leads',
    v_lead_id,
    v_ambassador.id,
    v_lead_id,
    false,
    now()
  );

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'status', 'pending',
    'possible_duplicate', v_duplicate_id is not null,
    'possible_duplicate_lead_id', v_duplicate_id,
    'duplicate_submission', false
  );
end;
$$;

revoke all on function public.submit_ambassador_lead(text, text, text, text, text, text) from public;
revoke all on function public.submit_ambassador_lead(text, text, text, text, text, text) from anon;
grant execute on function public.submit_ambassador_lead(text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_ambassador_lead(text, text, text, text, text, text) to service_role;

create or replace function public.admin_create_lead(
  p_admin_id uuid,
  p_ambassador_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_source text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if auth.uid() is distinct from p_admin_id or not exists (
    select 1 from public.users
    where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only the signed-in Admin can create leads';
  end if;

  if not exists (
    select 1 from public.ambassadors
    where id = p_ambassador_id and status <> 'deleted'
  ) then
    raise exception 'Ambassador not found';
  end if;

  if nullif(trim(p_customer_name), '') is null
     or nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer name and phone are required';
  end if;

  insert into public.leads (
    ambassador_id, source, source_detail, customer_name, customer_phone,
    customer_email, status, notes, click_count, last_clicked_at,
    lead_type, funnel_stage, lead_approval_status, approved_as_lead,
    approved_at, approved_by, created_at, updated_at
  ) values (
    p_ambassador_id,
    coalesce(nullif(trim(p_source), ''), 'direct'),
    jsonb_build_object('channel', 'admin_manual_entry', 'created_by_admin', p_admin_id),
    trim(p_customer_name),
    trim(p_customer_phone),
    nullif(lower(trim(p_customer_email)), ''),
    'new',
    nullif(trim(p_notes), ''),
    1,
    now(),
    'admin_created',
    'new_lead',
    'approved',
    true,
    now(),
    p_admin_id,
    now(),
    now()
  ) returning id into v_lead_id;

  insert into public.lead_events (
    lead_id, ambassador_id, event_type, event_title,
    event_description, event_data, created_by
  ) values (
    v_lead_id,
    p_ambassador_id,
    'lead_created',
    'Lead created and approved by Admin',
    'Admin manually added an approved lead for this Ambassador.',
    jsonb_build_object(
      'customer_name', trim(p_customer_name),
      'customer_phone', trim(p_customer_phone),
      'source', coalesce(nullif(trim(p_source), ''), 'direct'),
      'approved_immediately', true
    ),
    p_admin_id
  );

  return v_lead_id;
end;
$$;

revoke all on function public.admin_create_lead(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.admin_create_lead(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.admin_create_lead(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_create_lead(uuid, uuid, text, text, text, text, text) to service_role;

-- Approval/rejection functions remain idempotent, but anonymous callers must
-- never be able to invoke these privileged review actions.
create or replace function public.approve_lead_for_ambassador(
  p_admin_id uuid,
  p_lead_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  if auth.uid() is distinct from p_admin_id or not exists (
    select 1 from public.users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only the signed-in Admin can approve leads';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  if coalesce(v_lead.approved_as_lead, false) then
    return;
  end if;

  if v_lead.lead_approval_status = 'rejected' then
    raise exception 'Rejected leads must be reopened before approval';
  end if;

  update public.leads
  set lead_approval_status = 'approved',
      approved_as_lead = true,
      approved_at = now(),
      approved_by = p_admin_id,
      updated_at = now()
  where id = p_lead_id;

  insert into public.lead_events (
    lead_id, ambassador_id, event_type, event_title,
    event_description, event_data, created_by
  ) values (
    p_lead_id,
    v_lead.ambassador_id,
    'lead_approved',
    'Lead approved',
    'Admin approved this submission as a valid Ambassador lead.',
    jsonb_build_object('approved_at', now(), 'approved_by', p_admin_id),
    p_admin_id
  );

  update public.admin_notifications
  set is_read = true
  where related_table = 'leads' and related_id = p_lead_id;

  if v_lead.ambassador_id is not null then
    insert into public.ambassador_notifications (
      ambassador_id, type, title, message
    ) values (
      v_lead.ambassador_id,
      'lead_approved',
      'Lead approved',
      coalesce(v_lead.customer_name, 'Your submitted lead') || ' was approved by Admin.'
    );
  end if;
end;
$$;

create or replace function public.reject_lead_for_ambassador(
  p_admin_id uuid,
  p_lead_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  if auth.uid() is distinct from p_admin_id or not exists (
    select 1 from public.users where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'Only the signed-in Admin can reject leads';
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if v_lead.id is null then
    raise exception 'Lead not found';
  end if;

  if coalesce(v_lead.approved_as_lead, false) then
    raise exception 'Approved leads cannot be rejected';
  end if;

  if v_lead.lead_approval_status = 'rejected' then
    return;
  end if;

  update public.leads
  set lead_approval_status = 'rejected',
      approved_as_lead = false,
      notes = concat_ws(E'\n', nullif(notes, ''),
        case when nullif(trim(p_reason), '') is not null
          then 'Rejection reason: ' || trim(p_reason)
        end),
      updated_at = now()
  where id = p_lead_id;

  insert into public.lead_events (
    lead_id, ambassador_id, event_type, event_title,
    event_description, event_data, created_by
  ) values (
    p_lead_id,
    v_lead.ambassador_id,
    'lead_rejected',
    'Lead rejected',
    'Admin reviewed and rejected this Ambassador lead submission.',
    jsonb_build_object(
      'reason', nullif(trim(p_reason), ''),
      'rejected_at', now(),
      'rejected_by', p_admin_id
    ),
    p_admin_id
  );

  update public.admin_notifications
  set is_read = true
  where related_table = 'leads' and related_id = p_lead_id;

  if v_lead.ambassador_id is not null then
    insert into public.ambassador_notifications (
      ambassador_id, type, title, message
    ) values (
      v_lead.ambassador_id,
      'lead_rejected',
      'Lead needs attention',
      concat_ws(' ',
        coalesce(v_lead.customer_name, 'Your submitted lead') || ' was not approved.',
        case when nullif(trim(p_reason), '') is not null
          then 'Reason: ' || trim(p_reason)
        end
      )
    );
  end if;
end;
$$;

revoke all on function public.approve_lead_for_ambassador(uuid, uuid) from public;
revoke all on function public.approve_lead_for_ambassador(uuid, uuid) from anon;
revoke all on function public.reject_lead_for_ambassador(uuid, uuid, text) from public;
revoke all on function public.reject_lead_for_ambassador(uuid, uuid, text) from anon;
grant execute on function public.approve_lead_for_ambassador(uuid, uuid) to authenticated;
grant execute on function public.reject_lead_for_ambassador(uuid, uuid, text) to authenticated;

comment on function public.submit_ambassador_lead(text, text, text, text, text, text)
  is 'Creates an authenticated Ambassador-owned lead pending Admin approval, with idempotency and duplicate-review metadata.';
