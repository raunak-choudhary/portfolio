-- Honest analytics and the half signed-in contact form (2026-11-21).
-- Run by the owner in the SQL editor. Safe to run again.
--
-- 1. Analytics counts real visits to the live site only (owner's rule,
--    2026-11-19: real numbers, even when they are zero). The site's own code
--    already declines to send an event from localhost, from the admin's
--    routes, from the owner's browser or from an obvious crawler
--    (shouldTrackVisit in src/services/visitorTrackingService.js). The insert
--    policy now repeats the two checks the server can make for itself on the
--    request that carries the row:
--
--      - the Origin header is the live site. A browser sets Origin itself on
--        every cross-origin POST and page script cannot change it, so a page
--        served from localhost, a preview host or anyone else's site is
--        refused whatever its code does;
--      - the User-Agent is present (every browser sends one) and does not name
--        a crawler, a monitor, a link preview or a scripted client. The
--        pattern is the one the site uses.
--
--    A client outside a browser can send any headers it likes, so this is not
--    proof against a determined forger; it stops every accidental and every
--    ordinary automated source, which is where the false counts came from.
--    The policy stays `to anon`: a signed-in session is the owner, and the
--    owner is never a visitor.
--
--    If the header setting is missing the check fails closed: nothing is
--    counted. The verification at the end shows how to confirm it is present.
--
-- 2. The contact form refused a browser that held a session below level 2
--    (the owner between the email code and the authenticator step, or a
--    Google return): the insert policy named `anon` only and the admin policy
--    needs level 2. The same policy now also covers `authenticated`, with the
--    same checks, and the rate limit and server clock in the guard trigger
--    apply to every caller except the service role and a real (level 2)
--    admin. Before, any signed-in session skipped them.
--
-- Timestamps on these tables are `timestamp without time zone` filled by
-- now() in a UTC database; comparisons use (now() at time zone 'utc').

begin;

-- ---- 1. analytics: the live origin only, no crawlers ----

alter policy public_insert_analytics_events on public.analytics_events
  to anon
  with check (
    (user_type)::text = 'visitor'
    and (event_type)::text = any (array['page_view', 'section_view', 'form_submission', 'click'])
    and (event_category)::text = any (array['portfolio', 'contact', 'interaction'])
    and (metadata is null or pg_column_size(metadata) <= 4096)
    and "timestamp" between (now() at time zone 'utc') - interval '10 minutes' and (now() at time zone 'utc') + interval '10 minutes'
    and created_at between (now() at time zone 'utc') - interval '10 minutes' and (now() at time zone 'utc') + interval '10 minutes'
    and coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'origin', '')
        in ('https://www.raunakchoudhary.com', 'https://raunakchoudhary.com')
    and coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', '') <> ''
    and coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', '')
        !~* '(bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|uptime|pingdom|curl|wget|python|scrapy|phantom|externalhit|hostinger)'
  );

-- ---- 2. contact form: a session below level 2 may send, under the same limits ----

grant insert on table public.contact_messages to authenticated;

alter policy public_insert_contact_messages on public.contact_messages
  to anon, authenticated;

create or replace function app_private.guard_public_contact_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := (now() at time zone 'utc');
begin
  -- Not limited: the service role (Edge Functions, the SQL editor) and the
  -- admin at level 2. Everyone else is a visitor here, including a session
  -- that has passed only the first sign-in step.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') or app_private.is_admin() then
    return new;
  end if;
  -- The server's clock, so a back-dated row cannot slip under the window.
  new.created_at := v_now;
  new.updated_at := v_now;
  if (select count(*) from public.contact_messages m where m.created_at > v_now - interval '1 hour') >= 30 then
    raise exception 'too many messages, try again later' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_public_contact_insert() from public, anon, authenticated;

commit;

-- ---- verification (run after the migration; each is read-only) ----
--
-- a. Both insert policies, their roles and checks:
--    select tablename, policyname, roles::text, with_check
--      from pg_policies
--     where schemaname = 'public' and cmd = 'INSERT'
--       and tablename in ('analytics_events', 'contact_messages');
--    Expect analytics_events {anon} with 'origin' and 'user-agent' in the
--    check, and contact_messages {anon,authenticated}.
--
-- b. The guard names is_admin():
--    select pg_get_functiondef('app_private.guard_public_contact_insert()'::regprocedure) like '%is_admin()%';
--    Expect true.
--
-- c. From a terminal, a request without the live Origin is refused. Replace
--    <project> and <publishable key> (the public key the site already ships):
--    curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<project>.supabase.co/rest/v1/analytics_events" \
--      -H "apikey: <publishable key>" -H "Content-Type: application/json" \
--      -d '{"event_type":"page_view","event_category":"portfolio","event_action":"view_page","event_label":"home","user_type":"visitor"}'
--    Expect 401 or 403. (Do not add an Origin header to "see it work": that
--    would write a row that is not a visit.)
