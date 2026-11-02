// src/services/supabaseClient.js - FIXED FOR PRODUCTION

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Debug environment variables in development only
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Environment Variables Debug:');
  console.log('URL:', supabaseUrl);
  console.log('Anon Key Present:', !!supabaseAnonKey);
}

// Validate required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing required Supabase environment variables. Please check your environment configuration.\n' +
    'Required variables:\n' +
    '- REACT_APP_SUPABASE_URL\n' +
    '- REACT_APP_SUPABASE_ANON_KEY'
  );
}

// ✅ SIMPLIFIED: Basic client configuration for production
const supabaseConfig = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'dynamic-portfolio-public'
    }
  }
};

// ✅ Create main Supabase client (anonymous/public)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, supabaseConfig);

// ✅ FALLBACK: Admin client for admin operations only (if service role available)
let supabaseAdmin = null;
const supabaseServiceRoleKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;

export const getSupabaseAdmin = () => {
  // ✅ Only create admin client if service role key is available
  if (!supabaseServiceRoleKey) {
    console.warn('Service role key not available. Using anonymous client for all operations.');
    return supabase; // ✅ Fallback to anonymous client
  }

  if (!supabaseAdmin) {
    try {
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'x-application-name': 'dynamic-portfolio-admin'
          }
        }
      });
      console.log('✅ Admin client created successfully');
    } catch (error) {
      console.error('❌ Failed to create admin client:', error);
      return supabase; // ✅ Fallback to anonymous client
    }
  }

  return supabaseAdmin;
};

// ✅ Test connection function
export const testConnection = async () => {
  try {
    console.log('🔍 Testing Supabase connection...');
    
    // Test with a simple query that should work for anonymous users
    const { data, error } = await supabase
      .from('contact_messages')
      .select('count', { count: 'exact', head: true });

    if (error) {
      // This might be expected if RLS doesn't allow count access
      console.log('ℹ️ Connection test result:', error.message);
      
      // If it's an auth error, connection is working but permissions are restricted
      if (error.message.includes('permission') || error.message.includes('policy')) {
        return { 
          success: true, 
          message: 'Connection established (RLS policies active)',
          details: 'This is expected for anonymous access'
        };
      }
      
      throw error;
    }

    console.log('✅ Supabase connection successful');
    return { 
      success: true, 
      message: 'Connection established',
      data: data
    };
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return { 
      success: false, 
      error: error.message,
      details: 'Check your environment variables and network connection'
    };
  }
};

// ✅ Test anonymous access for contact form
export const testContactFormAccess = async () => {
  try {
    console.log('🔍 Testing contact form access...');
    
    // Test inserting a simple message (will show if RLS allows inserts)
    const testData = {
      name: 'Connection Test',
      email: 'test@example.com',
      organization: 'Test Org',
      role_position: 'tester',
      inquiry_type: 'general-inquiry',
      subject: 'Connection Test',
      message: 'This is a connection test message',
      priority: 'normal',
      status: 'unread'
    };

    const { data, error } = await supabase
      .from('contact_messages')
      .insert([testData])
      .select()
      .single();

    if (error) {
      console.error('❌ Contact form access test failed:', error);
      return { 
        success: false, 
        error: error.message,
        details: 'RLS policy may need to be updated to allow anonymous inserts'
      };
    }

    console.log('✅ Contact form access test successful');
    
    // Clean up test data
    if (data?.id) {
      await supabase
        .from('contact_messages')
        .delete()
        .eq('id', data.id);
    }

    return { 
      success: true, 
      message: 'Contact form access confirmed',
      data: data
    };
  } catch (error) {
    console.error('❌ Contact form access test error:', error);
    return { 
      success: false, 
      error: error.message
    };
  }
};

// Get current session
export const getCurrentSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      throw error;
    }

    return { success: true, session };
  } catch (error) {
    console.error('Error getting session:', error.message);
    return { success: false, error: error.message, session: null };
  }
};

// Check if user is authenticated
export const isAuthenticated = async () => {
  const { session } = await getCurrentSession();
  return !!session?.user;
};

// Sign out function
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      throw error;
    }

    return { success: true, message: 'Signed out successfully' };
  } catch (error) {
    console.error('Error signing out:', error.message);
    return { success: false, error: error.message };
  }
};

// ✅ Error handler utility
export const handleSupabaseError = (error, context = 'Operation') => {
  console.error(`${context} failed:`, error);
  
  const errorMessages = {
    'Failed to fetch': 'Network error. Please check your connection.',
    'Invalid JWT': 'Authentication expired. Please sign in again.',
    'Invalid API key': 'Configuration error. Please contact support.',
    'Row Level Security': 'Permission denied. Contact administrator.',
    'duplicate key value': 'This record already exists.',
    'foreign key constraint': 'Cannot delete: record is being used elsewhere.'
  };

  const userFriendlyMessage = Object.keys(errorMessages).find(key => 
    error.message?.includes(key)
  );

  return {
    success: false,
    error: userFriendlyMessage ? errorMessages[userFriendlyMessage] : error.message,
    technical: error.message,
    context
  };
};

// Export configuration for debugging
export const config = {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  hasServiceKey: !!supabaseServiceRoleKey,
  environment: process.env.NODE_ENV
};

// ✅ Development helper (only in development)
if (process.env.NODE_ENV === 'development') {
  window.supabase = supabase;
  window.supabaseConfig = config;
  window.testContactFormAccess = testContactFormAccess;
  console.log('🔧 Supabase client available in window.supabase for debugging');
  console.log('🔧 Test contact form access with: window.testContactFormAccess()');
}

export default supabase;