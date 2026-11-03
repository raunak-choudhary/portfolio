-- Remove personal data that has no place on a public portfolio (Unit 2.5b).
-- Every item below was approved by the owner on 2026-11-03 after reviewing
-- the inventory in docs/data-inventory.md. Removal is permanent: the public
-- content was exported to the owner's archive folder beforehand. The code
-- that read or wrote these fields was removed in the same pull request.

-- 1. Work experience: income, employer-internal rating and reason for leaving
--    were rendered in the expanded experience card and readable by anyone
--    through the public API.
alter table public.work_experience
  drop column if exists salary_range,
  drop column if exists performance_rating,
  drop column if exists reason_for_leaving;

-- 2. Contact messages: browser and campaign details are not needed to answer
--    a message. The form no longer sends them.
alter table public.contact_messages
  drop column if exists sender_ip,
  drop column if exists user_agent,
  drop column if exists referrer_url,
  drop column if exists utm_source,
  drop column if exists utm_medium,
  drop column if exists utm_campaign;

-- 3. About section: birth date, nationality and permanent residence leave the
--    public basic-info list. The list is a JSON array of {key, value,
--    order_index}; the remaining entries keep their relative order and are
--    renumbered so the admin editor sees a gap-free sequence.
update public.about_content
set basic_info = (
  select coalesce(
    jsonb_agg(jsonb_set(entry, '{order_index}', to_jsonb(ord - 1)) order by ord),
    '[]'::jsonb
  )
  from (
    select entry, row_number() over (order by (entry->>'order_index')::int) as ord
    from jsonb_array_elements(basic_info) as entry
    where entry->>'key' not in ('birthDate', 'nationality', 'permanentResidence')
  ) kept
)
where jsonb_typeof(basic_info) = 'array';

-- 4. Analytics: reduce the stored visitor fingerprint to the shape the tracker
--    now records: a device class derived from the screen width, the referrer
--    host, and the returning-visitor flag. User agent, language, timezone and
--    exact screen size are deleted.
update public.analytics_events
set metadata = jsonb_set(
  metadata,
  '{visitor_info}',
  jsonb_build_object(
    'deviceClass',
      case
        when (metadata->'visitor_info'->>'screenWidth')::int < 768 then 'phone'
        when (metadata->'visitor_info'->>'screenWidth')::int < 1280 then 'tablet'
        else 'desktop'
      end,
    'referrer',
      case
        when coalesce(metadata->'visitor_info'->>'referrer', '') in ('', 'direct') then 'direct'
        else coalesce(substring(metadata->'visitor_info'->>'referrer' from '^[a-z]+://([^/:?#]+)'), 'direct')
      end,
    'isReturningVisitor', coalesce((metadata->'visitor_info'->>'isReturningVisitor')::boolean, false)
  )
)
where jsonb_typeof(metadata->'visitor_info') = 'object'
  and metadata->'visitor_info' ? 'userAgent';
