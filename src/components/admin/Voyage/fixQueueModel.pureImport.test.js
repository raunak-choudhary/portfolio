// The fix queue model is pure: it must load with no Supabase settings at all
// (CI and a clean checkout run the suite without them). Before healthRules.js
// it reached supabaseClient through analyticsService, which throws at import
// when the settings are missing, and seven suites failed to load.

describe('the fix queue model without Supabase settings', () => {
  const saved = {};
  beforeEach(() => {
    ['REACT_APP_SUPABASE_URL', 'REACT_APP_SUPABASE_ANON_KEY'].forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
    jest.resetModules();
  });
  afterEach(() => {
    Object.entries(saved).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    jest.resetModules();
  });

  it('the Supabase client itself refuses to load, so the check below means something', () => {
    expect(() => jest.isolateModules(() => require('../../../services/supabaseClient'))).toThrow();
  });

  it('loads the model, the walk helpers and the health rules without the client', () => {
    let model, walk, rules;
    expect(() => jest.isolateModules(() => {
      model = require('./fixQueueModel');
      walk = require('./fixWalk');
      rules = require('../../../services/healthRules');
    })).not.toThrow();
    expect(typeof model.buildFixQueue).toBe('function');
    expect(typeof walk.useFixWalk).toBe('function');
    expect(rules.SECTION_HEALTH_RULES.length).toBeGreaterThan(0);
  });
});
