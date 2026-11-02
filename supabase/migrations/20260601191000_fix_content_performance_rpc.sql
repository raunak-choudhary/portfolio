begin;

create or replace function public.increment_content_performance(
  p_content_type text,
  p_content_id text,
  p_performance_date date,
  p_engagement_score integer default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.content_performance (
    content_type,
    content_id,
    performance_date,
    view_count,
    engagement_score,
    last_updated,
    is_featured
  )
  values (
    p_content_type,
    p_content_id,
    p_performance_date,
    1,
    p_engagement_score,
    now(),
    false
  )
  on conflict (content_type, content_id, performance_date)
  do update set
    view_count = public.content_performance.view_count + 1,
    engagement_score = greatest(public.content_performance.engagement_score, p_engagement_score),
    last_updated = now();
end;
$function$;

revoke all on function public.increment_content_performance(text, text, date, integer)
from public, anon, authenticated;

grant execute on function public.increment_content_performance(text, text, date, integer)
to anon, authenticated, service_role;

commit;
