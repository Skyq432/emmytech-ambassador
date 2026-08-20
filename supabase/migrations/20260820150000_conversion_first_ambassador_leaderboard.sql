-- Return only aggregate Ambassador performance. This lets authenticated users
-- see the leaderboard without exposing another Ambassador's lead/customer rows.
create or replace function public.get_ambassador_leaderboard(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  rank bigint,
  ambassador_id uuid,
  full_name text,
  total_conversions bigint,
  total_leads bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'A valid reporting period is required';
  end if;

  return query
  with performance as (
    select
      a.id as ambassador_id,
      coalesce(u.name, a.ambassador_tag, 'Ambassador') as full_name,
      coalesce(conversion_totals.total_conversions, 0) as total_conversions,
      coalesce(lead_totals.total_leads, 0) as total_leads
    from public.ambassadors a
    left join public.users u on u.id = a.user_id
    left join lateral (
      select count(*) as total_conversions
      from public.conversions c
      where c.ambassador_id = a.id
        and c.approved_at >= p_start_at
        and c.approved_at < p_end_at
    ) conversion_totals on true
    left join lateral (
      select count(*) as total_leads
      from public.leads l
      where l.ambassador_id = a.id
        and coalesce(l.approved_as_lead, false)
        and l.merged_into_lead_id is null
        and coalesce(l.approved_at, l.created_at) >= p_start_at
        and coalesce(l.approved_at, l.created_at) < p_end_at
    ) lead_totals on true
    where a.status = 'active'
  ), ranked as (
    select
      row_number() over (
        order by
          performance.total_conversions desc,
          performance.total_leads desc,
          performance.full_name asc,
          performance.ambassador_id asc
      ) as rank,
      performance.*
    from performance
    where performance.total_conversions > 0
       or performance.total_leads > 0
  )
  select
    ranked.rank,
    ranked.ambassador_id,
    ranked.full_name,
    ranked.total_conversions,
    ranked.total_leads
  from ranked
  order by ranked.rank;
end;
$$;

revoke all on function public.get_ambassador_leaderboard(timestamptz, timestamptz) from public;
revoke all on function public.get_ambassador_leaderboard(timestamptz, timestamptz) from anon;
grant execute on function public.get_ambassador_leaderboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.get_ambassador_leaderboard(timestamptz, timestamptz) to service_role;
