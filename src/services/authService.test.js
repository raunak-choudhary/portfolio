import {
  getCurrentAdmin,
  requireAdminAuth,
  requestAdminLoginOtp,
  signOutAdmin
} from './authService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signInWithOtp: jest.fn(),
      signOut: jest.fn()
    },
    from: jest.fn()
  }
}));

describe('authService secure admin auth', () => {
  let adminQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    delete window.location;
    window.location = { origin: 'https://www.raunakchoudhary.com' };

    adminQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn()
    };
    supabase.from.mockReturnValue(adminQuery);
  });

  it('requests a Supabase Auth OTP without browser-side password verification', async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({ error: null });

    const result = await requestAdminLoginOtp('Admin@Example.com ');

    expect(result.success).toBe(true);
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'admin@example.com',
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'https://www.raunakchoudhary.com/admindashboard'
      }
    });
  });

  it('rejects protected access when there is no Supabase Auth session', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });

    const result = await requireAdminAuth();

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NO_SESSION');
  });

  it('rejects protected access when the signed-in user is not an active admin', async () => {
    const user = { id: 'user-2', email: 'visitor@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: 'token' } },
      error: null
    });
    adminQuery.maybeSingle.mockResolvedValue({
      data: null,
      error: null
    });

    const result = await requireAdminAuth();

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_ADMIN');
    expect(supabase.from).toHaveBeenCalledWith('admin_users');
  });

  it('allows protected access when the signed-in email is an active admin', async () => {
    const user = { id: 'user-1', email: 'Admin@Example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: 'token' } },
      error: null
    });
    adminQuery.maybeSingle.mockResolvedValue({
      data: { id: 'admin-1', email: 'admin@example.com', is_active: true },
      error: null
    });

    const result = await requireAdminAuth();

    expect(result.success).toBe(true);
    expect(result.data.user).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'admin'
    });
    expect(adminQuery.eq).toHaveBeenCalledWith('email', 'admin@example.com');
    expect(adminQuery.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('clears the Supabase Auth session on sign out', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: null });

    const result = await signOutAdmin();

    expect(result.success).toBe(true);
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('returns the authenticated admin user from the current session', async () => {
    const user = { id: 'user-1', email: 'admin@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user, access_token: 'token' } },
      error: null
    });

    const admin = await getCurrentAdmin();

    expect(admin.user).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'admin'
    });
    expect(admin.isAuthenticated).toBe(true);
  });
});
