// =================================================================
// emailService.js - FIXED TO USE ANONYMOUS CLIENT
// =================================================================

import { supabase } from './supabaseClient'; // ✅ Use anonymous client instead of admin

/**
 * Name of the Edge Function that emails the owner. Invoked through the
 * Supabase client so the URL comes from REACT_APP_SUPABASE_URL and the public
 * key travels in the headers the gateway expects; nothing is hardcoded.
 */
export const CONTACT_EMAIL_FUNCTION = 'send-contact-email';

// Enhanced validation for new form structure
const validateContactForm = (formData) => {
  const errors = {};

  if (!formData.name || formData.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters long';
  }

  if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!formData.organization || formData.organization.trim().length < 2) {
    errors.organization = 'Organization/University name is required';
  }

  if (!formData.role) {
    errors.role = 'Please select your role';
  }

  if (!formData.inquiryType) {
    errors.inquiryType = 'Please select inquiry type';
  }

  if (!formData.subject || formData.subject.trim().length < 5) {
    errors.subject = 'Subject must be at least 5 characters long';
  }

  if (!formData.message || formData.message.trim().length < 20) {
    errors.message = 'Message must be at least 20 characters long';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// ✅ FIXED: Upload attachments using anonymous client
export const uploadAttachments = async (files) => {
  try {
    if (!files || files.length === 0) {
      return { success: true, data: [] };
    }

    console.log(`📎 Uploading ${files.length} attachments to Supabase Storage...`);
    
    // ✅ Use anonymous client with proper RLS policies
    const uploadPromises = files.map(async (file, index) => {
      // Generate unique filename
      const timestamp = Date.now();
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `contact-${timestamp}-${index + 1}-${cleanFileName}`;
      const filePath = `contact-attachments/${fileName}`;

      console.log(`📤 Uploading file: ${file.name} → ${fileName}`);

      // ✅ Upload using anonymous client (requires RLS policy allowing public uploads)
      const { error: uploadError } = await supabase.storage
        .from('contact-attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error(`❌ Upload failed for ${file.name}:`, uploadError);
        throw new Error(`Upload failed for ${file.name}: ${uploadError.message}`);
      }

      console.log(`✅ File uploaded successfully: ${file.name}`);

      return {
        originalName: file.name,
        fileName: fileName,
        filePath: filePath,
        size: file.size,
        type: file.type
      };
    });

    const uploadResults = await Promise.all(uploadPromises);
    
    console.log(`✅ All ${uploadResults.length} files uploaded successfully`);
    
    return {
      success: true,
      data: uploadResults
    };

  } catch (error) {
    console.error('❌ uploadAttachments error:', error);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
};

// ✅ FIXED: Store contact message using anonymous client
export const storeContactMessage = async (formData, uploadedFiles = []) => {
  try {
    console.log('💾 Storing contact message with uploaded files...');
    
    // ✅ Use anonymous client with proper RLS policies
    
    // Store private storage paths. The Edge Function turns these into temporary signed URLs.
    const attachmentPaths = uploadedFiles.map(file => file.filePath);
    const attachmentNames = uploadedFiles.map(file => file.originalName);
    
    const contactData = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      organization: formData.organization?.trim() || null,
      role_position: formData.role || 'other',
      inquiry_type: formData.inquiryType || 'general-inquiry',
      subject: formData.subject.trim(),
      message: formData.message.trim(),
      
      // Store private file paths, not public URLs. The attachment bucket stays private.
      attachment_urls: attachmentPaths,
      attachment_names: attachmentNames,
      
      // ✅ LEGACY: Keep first attachment in original fields for backward compatibility
      attachment_url: attachmentPaths.length > 0 ? attachmentPaths[0] : null,
      attachment_name: uploadedFiles.length > 0 ? uploadedFiles[0].originalName : null,
      attachment_size: uploadedFiles.length > 0 ? uploadedFiles[0].size : null,
      
      // Browser info
      user_agent: navigator.userAgent,
      referrer_url: document.referrer || window.location.href,
      utm_source: new URLSearchParams(window.location.search).get('utm_source'),
      utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
      utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
      
      // Default values
      priority: 'normal',
      status: 'unread'
    };

    console.log('📝 Contact data to store:', {
      ...contactData,
      attachment_count: attachmentPaths.length,
      attachment_files: uploadedFiles.map(f => ({ name: f.originalName, filePath: f.filePath }))
    });

    // ✅ Use anonymous client - this requires RLS policy allowing public inserts
    const { error } = await supabase
      .from('contact_messages')
      .insert([contactData]);

    if (error) {
      console.error('❌ Database insertion error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('✅ Contact message stored successfully with attachments:', {
      attachment_count: attachmentPaths.length
    });

    return {
      success: true,
      data: null,
      message: 'Contact message stored successfully'
    };

  } catch (error) {
    console.error('❌ storeContactMessage error:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
};

/**
 * Extracts a human-readable reason from a failed function invocation.
 * supabase-js attaches the HTTP response as `context`; the function replies
 * with JSON `{ success: false, error }`. Falls back to the error message.
 */
export const readFunctionError = async (invokeError) => {
  try {
    const response = invokeError?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.json();
      if (body?.error) return body.error;
    }
  } catch (parseError) {
    // The body was not JSON; the generic message below is used.
  }
  return invokeError?.message || '';
};

// ✅ Send real email with attachment download links
export const sendRealEmail = async (formData, uploadedFiles = []) => {
  try {
    console.log('📧 Sending real email with attachment links...');
    
    // Prepare email data for Edge Function with attachment info
    const emailData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      organization: formData.organization?.trim() || '',
      role: formData.role || '',
      inquiryType: formData.inquiryType || '',
      subject: formData.subject.trim(),
      message: formData.message.trim(),
      attachmentCount: uploadedFiles.length,
      attachments: uploadedFiles.map(file => ({
        name: file.originalName,
        filePath: file.filePath,
        size: file.size,
        type: file.type
      }))
    };

    console.log('📤 Calling Edge Function with attachment data:', {
      name: emailData.name,
      email: emailData.email,
      subject: emailData.subject,
      attachmentCount: emailData.attachmentCount,
      attachmentNames: emailData.attachments.map(a => a.name)
    });

    // Call the Edge Function through the client: it derives the URL from the
    // configured project and sends the public key as `apikey`.
    const { data: result, error: invokeError } = await supabase.functions.invoke(CONTACT_EMAIL_FUNCTION, {
      body: emailData
    });

    if (invokeError) {
      // A non-2xx reply surfaces here; its body may carry a reason.
      const detail = await readFunctionError(invokeError);
      console.error('❌ Edge Function error:', detail);
      throw new Error(detail || 'Failed to send email via Edge Function');
    }

    if (!result?.success) {
      console.error('❌ Edge Function error:', result);
      throw new Error(result?.error || 'Failed to send email via Edge Function');
    }

    console.log('✅ Email sent successfully with attachment links:', result.data);
    
    return {
      success: true,
      data: result.data,
      message: 'Email sent successfully'
    };

  } catch (error) {
    console.error('❌ sendRealEmail error:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
};

// ✅ FIXED: Main function with anonymous client
export const sendContactEmail = async (formData) => {
  try {
    console.log('📧 Processing contact form submission with REAL FILE ATTACHMENTS...');
    console.log('📝 Form data received:', {
      name: formData.name,
      email: formData.email,
      organization: formData.organization,
      role: formData.role,
      inquiryType: formData.inquiryType,
      subject: formData.subject,
      messageLength: formData.message?.length,
      attachmentCount: formData.attachments?.length || 0,
      attachmentNames: formData.attachments?.map(f => f.name) || []
    });
    
    // Validate form data
    const validation = validateContactForm(formData);
    if (!validation.isValid) {
      console.error('❌ Form validation failed:', validation.errors);
      return {
        success: false,
        errors: validation.errors,
        message: 'Please fix the form errors and try again.'
      };
    }

    console.log('✅ Form validation passed');

    // Step 1: Upload attachments to Supabase Storage
    let uploadedFiles = [];
    if (formData.attachments && formData.attachments.length > 0) {
      console.log('🔄 Step 1: Uploading attachments to storage...');
      const uploadResult = await uploadAttachments(formData.attachments);
      
      if (!uploadResult.success) {
        console.error('❌ File upload failed:', uploadResult.error);
        return {
          success: false,
          message: 'Failed to upload attachments. Please try again.',
          error: uploadResult.error
        };
      }
      
      uploadedFiles = uploadResult.data;
      console.log('✅ Step 1 completed: All files uploaded successfully');
    } else {
      console.log('ℹ️ No attachments to upload');
    }

    // Step 2: Store in database with file URLs
    console.log('🔄 Step 2: Storing message in database...');
    const storeResult = await storeContactMessage(formData, uploadedFiles);
    if (!storeResult.success) {
      console.error('❌ Database storage failed:', storeResult.error);
      return {
        success: false,
        message: 'Failed to store message. Please try again.',
        error: storeResult.error
      };
    }

    console.log('✅ Step 2 completed: Message stored in database');

    // Step 3: Send real email with attachment download links
    console.log('🔄 Step 3: Sending real email with attachment links...');
    const emailResult = await sendRealEmail(formData, uploadedFiles);
    if (!emailResult.success) {
      console.warn('⚠️ Email sending failed, but message and files were stored');
      console.error('❌ Email error:', emailResult.error);
      
      return {
        success: false,
        message: 'Message and files saved but email delivery failed. Please try again or contact directly.',
        error: emailResult.error,
        data: {
          messageId: null,
          messageNumber: null,
          attachmentCount: uploadedFiles.length,
          emailSent: false,
          timestamp: new Date().toISOString()
        }
      };
    }

    console.log('✅ Step 3 completed: Real email sent with attachment links!');
    console.log('🎉 COMPLETE SUCCESS: Database stored + Files uploaded + Email delivered');
    
    return {
      success: true,
      message: 'Thank you for reaching out to me, I will reply to you as soon as possible!!',
      data: {
        messageId: null,
        messageNumber: null,
        attachmentCount: uploadedFiles.length,
        attachmentPaths: uploadedFiles.map(f => f.filePath),
        emailSent: true,
        emailId: emailResult.data?.emailId,
        timestamp: new Date().toISOString(),
        recipient: 'raunakchoudhary17@gmail.com'
      }
    };
    
  } catch (error) {
    console.error('❌ sendContactEmail error:', error);
    return {
      success: false,
      message: 'Failed to send message. Please try again later.',
      error: error.message
    };
  }
};

// Validate attachment file
export const validateAttachment = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!file) {
    return { isValid: true };
  }

  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File size must be less than 5MB'
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Please upload JPG, PNG, PDF, or DOC files only.'
    };
  }

  return { isValid: true };
};

// Get contact form configuration
export const getContactFormConfig = () => {
  return {
    recipientEmail: 'raunakchoudhary17@gmail.com',
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 5, // ✅ Support up to 5 files
    allowedFileTypes: [
      'image/jpeg',
      'image/png', 
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    roleOptions: [
      { value: 'recruiter', label: 'Recruiter' },
      { value: 'hr-manager', label: 'HR Manager' },
      { value: 'hiring-manager', label: 'Hiring Manager' },
      { value: 'technical-lead', label: 'Technical Lead' },
      { value: 'developer', label: 'Fellow Developer' },
      { value: 'startup-founder', label: 'Startup Founder' },
      { value: 'student', label: 'Student' },
      { value: 'other', label: 'Other' }
    ],
    inquiryTypes: [
      { value: 'full-time-opportunity', label: '🏢 Full-Time Job Opportunity' },
      { value: 'contract-opportunity', label: '📋 Contract/Consulting Opportunity' },
      { value: 'internship-offer', label: '🎓 Internship Opportunity' },
      { value: 'freelance-project', label: '💼 Freelance Project' },
      { value: 'collaboration', label: '🤝 Technical Collaboration' },
      { value: 'startup-opportunity', label: '🚀 Startup Opportunity' },
      { value: 'research-project', label: '🔬 Research Project' },
      { value: 'mentorship-request', label: '👨‍🏫 Mentorship Request' },
      { value: 'speaking-event', label: '🎤 Speaking/Conference Invitation' },
      { value: 'interview-request', label: '📺 Interview/Podcast Request' },
      { value: 'networking', label: '🌐 Professional Networking' },
      { value: 'technical-discussion', label: '💭 Technical Discussion' },
      { value: 'general-inquiry', label: '❓ General Inquiry' }
    ]
  };
};
