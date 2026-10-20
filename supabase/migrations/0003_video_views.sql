-- View counting. Callable by anyone, but only counts videos the caller may actually watch,
-- and only increments by one per call (the API route adds per-session de-duplication + rate limiting).
create or replace function public.increment_video_views(p_video uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.internal_bypass', 'on', true);
  update public.videos
     set view_count = view_count + 1
   where id = p_video
     and processing_status = 'ready' and published_at is not null
     and visibility in ('public', 'unlisted');
  perform set_config('app.internal_bypass', 'off', true);
end $$;
revoke execute on function public.increment_video_views(uuid) from public;
grant execute on function public.increment_video_views(uuid) to anon, authenticated, service_role;
