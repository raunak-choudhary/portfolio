-- Retire the public security-definer content performance RPC from browser use.
-- Visitor analytics inserts remain available to public visitors. Content
-- performance aggregation should be reintroduced later through an Edge Function
-- or a private scheduled job if needed.

begin;

revoke execute on function public.increment_content_performance(text, text, date, integer)
from public, anon, authenticated;

grant execute on function public.increment_content_performance(text, text, date, integer)
to service_role;

commit;
