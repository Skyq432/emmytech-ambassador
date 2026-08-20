begin;

revoke update on table public.ambassador_notifications from authenticated;
grant update (is_read, read_at) on table public.ambassador_notifications to authenticated;

commit;
