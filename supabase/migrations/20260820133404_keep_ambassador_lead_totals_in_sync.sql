-- Keep ambassadors.total_leads aligned with the actual lead rows assigned to
-- each ambassador. Approval and conversion change a lead's state; they must
-- never create an additional lead count.

create or replace function public.recalculate_ambassador_total_leads(
  p_ambassador_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_ambassador_id is null then
    return;
  end if;

  update public.ambassadors
  set total_leads = (
    select count(*)::integer
    from public.leads
    where ambassador_id = p_ambassador_id
  )
  where id = p_ambassador_id;
end;
$$;

create or replace function public.sync_ambassador_total_leads_from_lead()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_ambassador_total_leads(old.ambassador_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.ambassador_id is distinct from new.ambassador_id then
    perform public.recalculate_ambassador_total_leads(old.ambassador_id);
  end if;

  perform public.recalculate_ambassador_total_leads(new.ambassador_id);
  return new;
end;
$$;

drop trigger if exists sync_ambassador_total_leads_from_lead on public.leads;
create trigger sync_ambassador_total_leads_from_lead
after insert or delete or update of ambassador_id on public.leads
for each row
execute function public.sync_ambassador_total_leads_from_lead();

-- Existing RPCs historically incremented total_leads themselves. This guard
-- makes the real lead rows authoritative even if an older RPC attempts another
-- increment during approval or conversion.
create or replace function public.enforce_ambassador_total_leads()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.total_leads := (
    select count(*)::integer
    from public.leads
    where ambassador_id = new.id
  );
  return new;
end;
$$;

drop trigger if exists enforce_ambassador_total_leads on public.ambassadors;
create trigger enforce_ambassador_total_leads
before insert or update of total_leads on public.ambassadors
for each row
execute function public.enforce_ambassador_total_leads();

-- Repair counters that drifted before the invariant existed.
update public.ambassadors a
set total_leads = (
  select count(*)::integer
  from public.leads l
  where l.ambassador_id = a.id
);

revoke all on function public.recalculate_ambassador_total_leads(uuid) from public;
revoke all on function public.sync_ambassador_total_leads_from_lead() from public;
revoke all on function public.enforce_ambassador_total_leads() from public;

grant execute on function public.recalculate_ambassador_total_leads(uuid) to authenticated;
grant execute on function public.recalculate_ambassador_total_leads(uuid) to service_role;
