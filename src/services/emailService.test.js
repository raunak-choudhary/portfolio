import { supabase } from './supabaseClient';
import { CONTACT_EMAIL_FUNCTION, readFunctionError, sendRealEmail } from './emailService';

jest.mock('./supabaseClient', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
    storage: { from: jest.fn() }
  }
}));

const formData = {
  name: ' Ada Lovelace ',
  email: 'ada@example.com',
  organization: 'Analytical Engines',
  role: 'recruiter',
  inquiryType: 'full-time-opportunity',
  subject: 'Role at Analytical Engines',
  message: 'We would like to talk about a position.'
};

const uploaded = [{ originalName: 'brief.pdf', filePath: 'contact-attachments/contact-1-1-brief.pdf', size: 1024, type: 'application/pdf' }];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('sendRealEmail', () => {
  it('invokes the contact function through the client with the trimmed form and attachment paths', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { success: true, data: { emailId: 'em_1' } }, error: null });

    const result = await sendRealEmail(formData, uploaded);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ emailId: 'em_1' });
    expect(supabase.functions.invoke).toHaveBeenCalledWith(CONTACT_EMAIL_FUNCTION, {
      body: expect.objectContaining({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'Role at Analytical Engines',
        attachmentCount: 1,
        attachments: [expect.objectContaining({ name: 'brief.pdf', filePath: uploaded[0].filePath })]
      })
    });
  });

  it('reports the function reason when the function answers with an error body', async () => {
    const response = { json: async () => ({ success: false, error: 'Attachment path not allowed' }) };
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: response } });

    const result = await sendRealEmail(formData, []);

    expect(result).toMatchObject({ success: false, error: 'Attachment path not allowed' });
  });

  it('falls back to the invocation message when the error body is not JSON', async () => {
    const response = { json: async () => { throw new Error('not json'); } };
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function', context: response } });

    const result = await sendRealEmail(formData, []);

    expect(result).toMatchObject({ success: false, error: 'Failed to send a request to the Edge Function' });
  });

  it('treats a 200 reply without success as a failure', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { success: false, error: 'Email service not configured' }, error: null });

    const result = await sendRealEmail(formData, []);

    expect(result).toMatchObject({ success: false, error: 'Email service not configured' });
  });
});

describe('readFunctionError', () => {
  it('prefers the error in the response body, then the message, then an empty string', async () => {
    expect(await readFunctionError({ message: 'm', context: { json: async () => ({ error: 'body reason' }) } })).toBe('body reason');
    expect(await readFunctionError({ message: 'm', context: { json: async () => ({}) } })).toBe('m');
    expect(await readFunctionError(undefined)).toBe('');
  });
});
