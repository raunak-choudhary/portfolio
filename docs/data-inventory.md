# Data inventory

Every table in the Supabase project, what it holds, who can read it, and the personal-data decisions taken on 2026-11-03 (Unit 2.5b). Rule 11 in the project notes: no personal data without a portfolio purpose; removals are permanent column drops, approved one by one by the owner.

Access model: visitors (the `anon` role) can read active rows of the content tables and insert into `contact_messages` and `analytics_events`. Only the owner, signed in through Supabase Auth, can read messages and analytics or change content.

## Content tables (read by visitors)

| Table | Holds | Personal data review |
|---|---|---|
| hero_content | Headline, subtitle, description, highlights, call to action | None |
| about_content | About text, profile images, `basic_info` list of key and value pairs | Removed: birth date, nationality, permanent residence. Kept by owner decision: pronouns, current residence, time zone, languages, visa status, work authorization (recruiters ask) |
| projects | Title, descriptions, technologies, links, images, team size | None |
| skills | Name, category, proficiency, icon, related projects | None |
| certifications | Issuer, dates, credential id and link, badge, PDF | None (credentials are meant to be verified) |
| education | Degree, institution, dates, GPA, coursework, thesis | GPA kept: academic record with a portfolio purpose |
| work_experience | Title, company, dates, responsibilities, technologies, team size, clients served, department | Removed: salary range, performance rating, reason for leaving (all were rendered in the expanded card and readable through the public API) |
| internships | Same shape as work experience plus certificate links | None |
| leadership | Role, organisation, dates, responsibilities, impact; `budget_managed` unused | None |
| achievements | Title, organisation, competition, position, certificate | None |
| recommendations | Recommender name, title, organisation, LinkedIn link, text | Third-party data given for publication; kept |

## Visitor-written tables

| Table | Holds | Personal data review |
|---|---|---|
| contact_messages | Name, email, organisation, role, inquiry type, subject, message, attachment paths, owner workflow fields (status, notes, flags) | Removed: sender IP, user agent, referrer URL, UTM source, medium and campaign. The form no longer collects them. Name and email are what the sender gives to be answered |
| analytics_events | Event type, category, action, label, session id, `metadata` | Reduced: `metadata.visitor_info` now holds only a device class (phone, tablet, desktop), the referrer host and a returning-visitor flag. User agent, language, timezone and exact screen size were deleted from the 3,237 stored events and are no longer collected |

## Owner-only tables

| Table | Holds | Review |
|---|---|---|
| admin_users | id, email, active flag, timestamps | 2025 login columns dropped in Unit 2.5 |
| admin_sessions, admin_activity_analytics | Dashboard session durations and counts | Counts and dates only |
| contact_analytics, portfolio_metrics, content_performance | Aggregates derived from the tables above | Counts and dates only |

## Storage

| Bucket | Holds | Review |
|---|---|---|
| Public content buckets | Profile and project images, logos, certificates, resume PDFs | Published by design |
| contact-attachments (private) | Files visitors attach to a message | Readable only through a 24-hour signed link sent to the owner |

## Checks

- No phone number, street address or similar pattern exists in any text column (regular-expression scan over the content tables, 2026-11-03).
- The public export taken before the Postgres upgrade (owner's archive folder, 2026-11-03) is the last copy of the removed values.
- Re-run this review whenever a column is added. A new column that holds personal data needs a purpose recorded here before it ships.
