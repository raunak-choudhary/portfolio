-- Drop the 2025 username-and-password login's leftovers from admin_users.
--
-- Since the June 2026 lockdown the admin signs in through Supabase Auth and
-- app_private.is_admin() matches only on email and is_active. No code reads
-- the columns below (verified by grep over src/, scripts/, e2e/ and the
-- functions), and their values are treated as exposed by the leaked key
-- (CLAUDE.md, incident record). Dropping them is both clean-up and
-- containment: the bcrypt hash of the old password disappears with them.
--
-- The dependent indexes (idx_admin_username, idx_admin_users_otp,
-- idx_admin_users_otp_expires) are dropped automatically with their columns.
-- Nothing else depends on them: the only policy and the only function that
-- touch this table reference id, email and is_active.

alter table public.admin_users
  drop column if exists username,
  drop column if exists password_hash,
  drop column if exists otp_code,
  drop column if exists otp_expires_at,
  drop column if exists otp_attempts,
  drop column if exists otp_last_sent,
  drop column if exists two_fa_enabled,
  drop column if exists login_attempts,
  drop column if exists locked_until;
