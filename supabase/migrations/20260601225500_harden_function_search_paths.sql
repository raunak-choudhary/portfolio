begin;

alter function public.calculate_portfolio_completeness()
set search_path = public, pg_temp;

alter function public.generate_daily_portfolio_metrics()
set search_path = public, pg_temp;

alter function public.get_public_url(text, text)
set search_path = public, pg_temp;

alter function public.update_updated_at_column()
set search_path = public, pg_temp;

alter function public.validate_file_upload(text, bigint, text)
set search_path = public, pg_temp;

commit;
