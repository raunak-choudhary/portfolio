-- Revoke public access from admin/analytics RPCs that are not needed by the
-- public portfolio. Keep increment_content_performance public because visitor
-- tracking intentionally calls that narrow RPC.

begin;

revoke execute on function public.calculate_portfolio_completeness()
from public, anon, authenticated;

revoke execute on function public.generate_daily_portfolio_metrics()
from public, anon, authenticated;

grant execute on function public.calculate_portfolio_completeness()
to service_role;

grant execute on function public.generate_daily_portfolio_metrics()
to service_role;

commit;
