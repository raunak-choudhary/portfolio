// supabase/functions/send-contact-email/index.ts
// UPDATED WITH CREATIVE PROFESSIONAL EMAIL TEMPLATE
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ATTACHMENT_BUCKET = 'contact-attachments';
const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

const getAttachmentPath = (file)=>{
  const candidate = file?.filePath || file?.path || file?.url || '';
  if (!candidate || typeof candidate !== 'string') {
    return '';
  }
  try {
    const parsedUrl = new URL(candidate);
    const objectPublicMarker = `/storage/v1/object/public/${ATTACHMENT_BUCKET}/`;
    const objectSignMarker = `/storage/v1/object/sign/${ATTACHMENT_BUCKET}/`;
    const marker = parsedUrl.pathname.includes(objectPublicMarker) ? objectPublicMarker : objectSignMarker;
    if (parsedUrl.pathname.includes(marker)) {
      return decodeURIComponent(parsedUrl.pathname.split(marker)[1] || '').replace(/^\/+/, '');
    }
  } catch (_) {
    // Plain storage paths are expected from the current frontend.
  }
  return candidate.replace(/^\/+/, '');
};

const buildEmailAttachments = async (attachments)=>{
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAdmin = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }) : null;
  if (!supabaseAdmin) {
    console.error("❌ Supabase service credentials not available for attachment signing");
  }
  return await Promise.all(attachments.map(async (file)=>{
    const filePath = getAttachmentPath(file);
    if (!filePath || !supabaseAdmin) {
      return {
        ...file,
        filePath,
        url: '',
        signedUrlError: filePath ? 'Attachment signing is not configured' : 'Attachment path is missing'
      };
    }
    const { data, error } = await supabaseAdmin.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(filePath, ATTACHMENT_SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.error("❌ Failed to sign attachment URL:", {
        filePath,
        error: error.message
      });
    }
    return {
      ...file,
      filePath,
      url: data?.signedUrl || '',
      signedUrlError: error?.message || ''
    };
  }));
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
console.log("📧 Contact Email Edge Function loaded - Creative Template Version");
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log("📨 Processing contact email request...");
    // Parse request body
    const { name, email, organization, role, inquiryType, subject, message, attachmentCount = 0, attachments = [] } = await req.json();
    console.log("📝 Contact form data:", {
      name,
      email,
      organization,
      role,
      inquiryType,
      subject
    });
    // Validate required fields
    if (!name || !email || !subject || !message) {
      console.error("❌ Missing required fields");
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required fields"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get Resend API key from environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error("❌ Resend API key not configured");
      return new Response(JSON.stringify({
        success: false,
        error: "Email service not configured"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const emailAttachments = await buildEmailAttachments(attachments);
    const effectiveAttachmentCount = emailAttachments.length;
    // Format timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    // Get inquiry type display with emoji
    const getInquiryDisplay = (type)=>{
      const inquiryMap = {
        'full-time-opportunity': '🏢 Full-Time Job Opportunity',
        'contract-opportunity': '📋 Contract/Consulting Opportunity',
        'internship-offer': '🎓 Internship Opportunity',
        'freelance-project': '💼 Freelance Project',
        'collaboration': '🤝 Technical Collaboration',
        'startup-opportunity': '🚀 Startup Opportunity',
        'research-project': '🔬 Research Project',
        'mentorship-request': '👨‍🏫 Mentorship Request',
        'speaking-event': '🎤 Speaking/Conference Invitation',
        'interview-request': '📺 Interview/Podcast Request',
        'networking': '🌐 Professional Networking',
        'technical-discussion': '💭 Technical Discussion',
        'general-inquiry': '❓ General Inquiry'
      };
      return inquiryMap[type] || `📧 ${type}`;
    };
    // Get role display with appropriate styling
    const getRoleColor = (role)=>{
      const roleColors = {
        'recruiter': '#FF6B6B',
        'hr-manager': '#4ECDC4',
        'hiring-manager': '#45B7D1',
        'technical-lead': '#96CEB4',
        'startup-founder': '#FFEAA7',
        'developer': '#DDA0DD',
        'student': '#98D8C8'
      };
      return roleColors[role] || '#74B9FF';
    };
    // Create professional creative email template
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Portfolio Contact - ${subject}</title>
        <!--[if mso]>
        <noscript>
          <xml>
            <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
          </xml>
        </noscript>
        <![endif]-->
        <style>
          /* Reset styles */
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
          
          /* Client-specific styles */
          body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-width: 100% !important; }
          .ReadMsgBody { width: 100%; } .ExternalClass { width: 100%; }
          
          /* Responsive styles */
          @media screen and (max-width: 600px) {
            .mobile-center { text-align: center !important; }
            .mobile-padding { padding: 20px !important; }
            .mobile-stack { display: block !important; width: 100% !important; }
            .mobile-hide { display: none !important; }
            .hero-title { font-size: 28px !important; line-height: 32px !important; }
            .section-title { font-size: 20px !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        
        <!-- Main Container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa;">
          <tr>
            <td style="padding: 20px 0;">
              
              <!-- Email Container -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; box-shadow: 0 8px 32px rgba(0,0,0,0.12); border-radius: 16px; overflow: hidden;">
                
                <!-- Hero Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; position: relative;">
                    <!-- Overlay pattern -->
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle at 20% 80%, rgba(120,119,198,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%); pointer-events: none;"></div>
                    
                    <h1 class="hero-title" style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; line-height: 38px; text-shadow: 0 2px 4px rgba(0,0,0,0.3); position: relative; z-index: 1;">
                      🚀 New Portfolio Contact
                    </h1>
                    <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.9); font-size: 18px; font-weight: 400; position: relative; z-index: 1;">
                      Professional inquiry received from <strong>${organization || 'a potential collaborator'}</strong>
                    </p>
                    
                    <!-- Priority Badge -->
                    <div style="margin-top: 20px; position: relative; z-index: 1;">
                      <span style="background: rgba(255,255,255,0.2); color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; border: 1px solid rgba(255,255,255,0.3);">
                        🎯 ${getInquiryDisplay(inquiryType)}
                      </span>
                    </div>
                  </td>
                </tr>
                
                <!-- Contact Information Section -->
                <tr>
                  <td style="padding: 0;">
                    <!-- Section Header -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="background: linear-gradient(90deg, #f8f9fa 0%, #e9ecef 100%); padding: 20px 30px; border-bottom: 3px solid #667eea;">
                          <h2 class="section-title" style="margin: 0; color: #2d3748; font-size: 22px; font-weight: 700; display: flex; align-items: center;">
                            📋 Contact Information
                          </h2>
                          <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Complete details from the inquiry</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Contact Details Grid -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 30px;">
                      <tr>
                        <!-- Left Column -->
                        <td width="50%" style="vertical-align: top; padding-right: 15px;">
                          
                          <!-- Name Card -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                            <tr>
                              <td style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px;">
                                <div style="color: #4a5568; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">👤 Full Name</div>
                                <div style="color: #2d3748; font-size: 16px; font-weight: 600;">${name}</div>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Email Card -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                            <tr>
                              <td style="background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 8px; padding: 15px;">
                                <div style="color: #276749; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">📧 Email Address</div>
                                <div style="color: #2f855a; font-size: 16px; font-weight: 600;">
                                  <a href="mailto:${email}" style="color: #2f855a; text-decoration: none;">${email}</a>
                                </div>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Organization Card -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background: #fef5e7; border: 1px solid #fbd38d; border-radius: 8px; padding: 15px;">
                                <div style="color: #9c4221; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">🏢 Organization</div>
                                <div style="color: #c05621; font-size: 16px; font-weight: 600;">${organization || 'Not specified'}</div>
                              </td>
                            </tr>
                          </table>
                          
                        </td>
                        
                        <!-- Right Column -->
                        <td width="50%" style="vertical-align: top; padding-left: 15px;">
                          
                          <!-- Role Card -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                            <tr>
                              <td style="background: linear-gradient(135deg, ${getRoleColor(role)}15 0%, ${getRoleColor(role)}25 100%); border: 1px solid ${getRoleColor(role)}40; border-radius: 8px; padding: 15px;">
                                <div style="color: ${getRoleColor(role)}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">💼 Professional Role</div>
                                <div style="color: #2d3748; font-size: 16px; font-weight: 600; text-transform: capitalize;">${role || 'Not specified'}</div>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Subject Card -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                            <tr>
                              <td style="background: #e6fffa; border: 1px solid #81e6d9; border-radius: 8px; padding: 15px;">
                                <div style="color: #234e52; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">📋 Subject</div>
                                <div style="color: #2c7a7b; font-size: 16px; font-weight: 600;">${subject}</div>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Timestamp Card -->
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px;">
                                <div style="color: #4a5568; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">⏰ Received</div>
                                <div style="color: #2d3748; font-size: 14px; font-weight: 600;">${timestamp}</div>
                              </td>
                            </tr>
                          </table>
                          
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Message Section -->
                <tr>
                  <td style="padding: 0;">
                    <!-- Section Header -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="background: linear-gradient(90deg, #f0f4f8 0%, #d6f5d6 100%); padding: 20px 30px; border-bottom: 3px solid #48bb78;">
                          <h2 class="section-title" style="margin: 0; color: #2d3748; font-size: 22px; font-weight: 700;">
                            💬 Message Content
                          </h2>
                          <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Detailed inquiry information</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Message Content -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 30px;">
                          <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-left: 4px solid #667eea; border-radius: 8px; padding: 25px; position: relative;">
                            <!-- Quote icon -->
                            <div style="position: absolute; top: 15px; right: 20px; font-size: 24px; color: #cbd5e0; opacity: 0.6;">"</div>
                            <p style="margin: 0; color: #2d3748; font-size: 16px; line-height: 1.7; white-space: pre-wrap; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${message}</p>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                ${effectiveAttachmentCount > 0 ? `
                <!-- Attachments Section -->
                <tr>
                  <td style="padding: 0;">
                    <!-- Section Header -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="background: linear-gradient(90deg, #fef5e7 0%, #fed7aa 100%); padding: 20px 30px; border-bottom: 3px solid #f6ad55;">
                          <h2 class="section-title" style="margin: 0; color: #2d3748; font-size: 22px; font-weight: 700;">
                            📎 Attachments
                          </h2>
                          <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Files included with this inquiry</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Attachment Files List -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 30px;">
                          <div style="background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%); border: 2px solid #f6ad55; border-radius: 12px; padding: 20px;">
                            <div style="text-align: center; margin-bottom: 20px;">
                              <div style="font-size: 48px; margin-bottom: 10px;">📎</div>
                              <p style="margin: 0; color: #9c4221; font-size: 18px; font-weight: 600;">
                                ${effectiveAttachmentCount} file${effectiveAttachmentCount > 1 ? 's' : ''} attached
                              </p>
                            </div>
                            
                            <!-- Individual File Download Links -->
                            <div style="text-align: left;">
                              ${emailAttachments.map((file, index)=>`
                                <div style="background: #ffffff; border: 1px solid #f6ad55; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                                  <div style="flex: 1;">
                                    <div style="color: #2d3748; font-weight: 600; font-size: 14px; margin-bottom: 5px;">
                                      📄 ${file.name}
                                    </div>
                                    <div style="color: #718096; font-size: 12px;">
                                      Size: ${(file.size / 1024 / 1024).toFixed(2)} MB • Type: ${file.type}
                                    </div>
                                  </div>
                                  <div style="margin-left: 15px;">
                                    ${file.url ? `<a href="${file.url}" style="background: #f6ad55; color: #ffffff; padding: 8px 16px; border-radius: 20px; text-decoration: none; font-weight: 600; font-size: 12px; display: inline-block;">
                                      📥 Download
                                    </a>` : `<span style="background: #a0aec0; color: #ffffff; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 12px; display: inline-block;">
                                      Stored Privately
                                    </span>`}
                                  </div>
                                </div>
                              `).join('')}
                            </div>
                            
                            <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #f6ad55;">
                              <p style="margin: 0; color: #c05621; font-size: 12px; font-style: italic;">
                                💡 Click "Download" to access each file
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}
                
                <!-- Action Section -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h3 style="margin: 0 0 15px 0; color: #ffffff; font-size: 20px; font-weight: 600;">
                      Ready to Respond?
                    </h3>
                    <p style="margin: 0 0 25px 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                      Take action on this ${getInquiryDisplay(inquiryType).toLowerCase()}
                    </p>
                    
                    <!-- Action Buttons -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 0 10px;">
                          <a href="mailto:${email}?subject=Re: ${subject}" style="display: inline-block; background: #ffffff; color: #667eea; padding: 12px 24px; border-radius: 25px; text-decoration: none; font-weight: 600; font-size: 14px; border: 2px solid #ffffff;">
                            📧 Reply Directly
                          </a>
                        </td>
                        <td style="padding: 0 10px;">
                          <a href="https://your-portfolio.com" style="display: inline-block; background: rgba(255,255,255,0.1); color: #ffffff; padding: 12px 24px; border-radius: 25px; text-decoration: none; font-weight: 600; font-size: 14px; border: 2px solid rgba(255,255,255,0.3);">
                            🌐 Visit Portfolio
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #2d3748; color: #a0aec0; padding: 25px 30px; text-align: center;">
                    <p style="margin: 0 0 10px 0; font-size: 14px;">
                      This message was sent from your portfolio contact form
                    </p>
                    <p style="margin: 0; font-size: 12px; opacity: 0.7;">
                      🌐 <a href="https://your-portfolio.com" style="color: #81e6d9; text-decoration: none;">your-portfolio.com</a> | 
                      Built with ❤️ for professional networking
                    </p>
                    
                    <!-- Social Links -->
                    <div style="margin-top: 15px;">
                      <a href="https://linkedin.com/in/raunak-choudhary" style="display: inline-block; margin: 0 8px; color: #81e6d9; font-size: 12px; text-decoration: none;">LinkedIn</a>
                      <span style="color: #4a5568;">•</span>
                      <a href="https://github.com/raunak-choudhary" style="display: inline-block; margin: 0 8px; color: #81e6d9; font-size: 12px; text-decoration: none;">GitHub</a>
                      <span style="color: #4a5568;">•</span>
                      <a href="tel:+19292894648" style="display: inline-block; margin: 0 8px; color: #81e6d9; font-size: 12px; text-decoration: none;">Phone</a>
                    </div>
                  </td>
                </tr>
                
              </table>
              <!-- End Email Container -->
              
            </td>
          </tr>
        </table>
        <!-- End Main Container -->
        
      </body>
      </html>
    `;
    // Enhanced plain text version
    const emailText = `
🚀 NEW PORTFOLIO CONTACT - PROFESSIONAL INQUIRY
=====================================================

📋 CONTACT INFORMATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email}
🏢 Organization: ${organization || 'Not specified'}
💼 Role: ${role || 'Not specified'}
🎯 Inquiry Type: ${getInquiryDisplay(inquiryType)}
📋 Subject: ${subject}
⏰ Received: ${timestamp}

💬 MESSAGE CONTENT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${message}

${effectiveAttachmentCount > 0 ? `
📎 ATTACHMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${emailAttachments.map((file, index)=>`
📄 File ${index + 1}: ${file.name}
📥 Download: ${file.url || 'Stored privately; signed link unavailable'}
📊 Size: ${(file.size / 1024 / 1024).toFixed(2)} MB
📋 Type: ${file.type}
`).join('')}
` : ''}

🚀 QUICK ACTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Reply: mailto:${email}?subject=Re: ${subject}
🌐 Portfolio: https://your-portfolio.com
💼 LinkedIn: https://linkedin.com/in/raunak-choudhary

═══════════════════════════════════════════════════════════════
This message was sent from your portfolio contact form
🌐 your-portfolio.com | Built with ❤️ for professional networking
═══════════════════════════════════════════════════════════════
    `;
    // Send email via Resend API
    console.log("📤 Sending creative email via Resend...");
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Portfolio Contact <onboarding@resend.dev>',
        to: [
          'raunakchoudhary17@gmail.com'
        ],
        reply_to: [
          email
        ],
        subject: `Portfolio Contact: ${subject}`,
        html: emailHtml,
        text: emailText
      })
    });
    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      console.error("❌ Resend API error:", emailResult);
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to send email",
        details: emailResult
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log("✅ Creative email sent successfully:", emailResult.id);
    // Return success response
    return new Response(JSON.stringify({
      success: true,
      data: {
        emailId: emailResult.id,
        message: "Professional creative email sent successfully",
        recipient: "raunakchoudhary17@gmail.com",
        timestamp: timestamp,
        template: "creative-professional-v1"
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("❌ Edge function error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: "Internal server error",
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
