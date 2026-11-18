// Checks the options the shared Supabase client is created with. The module
// throws without its two public environment values, so the test provides
// stand-ins and captures what createClient receives.

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ auth: {} })) }));

describe('supabaseClient', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses the PKCE flow and reads sessions from the redirect URL', () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://project.supabase.test';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'public-test-key';
    jest.isolateModules(() => {
      const { createClient } = require('@supabase/supabase-js');
      require('./supabaseClient');
      const [, , options] = createClient.mock.calls[0];
      expect(options.auth).toEqual(expect.objectContaining({
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true
      }));
    });
  });
});
