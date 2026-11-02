// =================================================================
// ContactForm.js - Updated with Real API Integration
// =================================================================

// src/components/sections/Contact/ContactForm.js

import React from 'react';
import visitorTracking from '../../../services/visitorTrackingService';
import { useState, useEffect } from 'react';
import { sendContactEmail } from '../../../services/emailService';
import './Contact.css';

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    role: '',
    inquiryType: '',
    subject: '',
    message: '',
    attachments: []
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [showForm, setShowForm] = useState(true);

  // Enhanced role options with recruiter-focused ordering
  const roleOptions = [
    { value: 'recruiter', label: 'Recruiter' },
    { value: 'hr-manager', label: 'HR Manager' },
    { value: 'hiring-manager', label: 'Hiring Manager' },
    { value: 'technical-lead', label: 'Technical Lead' },
    { value: 'team-lead', label: 'Team Lead' },
    { value: 'project-manager', label: 'Project Manager' },
    { value: 'cto-executive', label: 'CTO/Executive' },
    { value: 'developer', label: 'Fellow Developer' },
    { value: 'startup-founder', label: 'Startup Founder' },
    { value: 'student', label: 'Student' },
    { value: 'researcher', label: 'Researcher' },
    { value: 'other', label: 'Other' }
  ];

  // Enhanced inquiry types with professional focus
  const inquiryTypes = [
    { value: '', label: 'Select inquiry type' },
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
  ];

  // Enhanced validation with professional context
  const validateForm = () => {
    const newErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Please enter your full name';
    }

    // Email validation with enhanced pattern
    if (!formData.email.trim()) {
      newErrors.email = 'Professional email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Organization validation
    if (!formData.organization.trim()) {
      newErrors.organization = 'Organization/University name is required';
    } else if (formData.organization.trim().length < 2) {
      newErrors.organization = 'Please enter a valid organization name';
    }

    // Role validation
    if (!formData.role) {
      newErrors.role = 'Please select your role/position';
    }

    // Inquiry type validation
    if (!formData.inquiryType) {
      newErrors.inquiryType = 'Please select the type of inquiry';
    }

    // Subject validation with context
    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject line is required';
    } else if (formData.subject.trim().length < 5) {
      newErrors.subject = 'Subject must be at least 5 characters';
    } else if (formData.subject.trim().length > 100) {
      newErrors.subject = 'Subject must be less than 100 characters';
    }

    // Message validation with professional context
    if (!formData.message.trim()) {
      newErrors.message = 'Message content is required';
    } else if (formData.message.trim().length < 20) {
      newErrors.message = 'Please provide more details (minimum 20 characters)';
    } else if (formData.message.trim().length > 2000) {
      newErrors.message = 'Message must be less than 2000 characters';
    }

    // File validation
    if (formData.attachments.length > 5) {
      newErrors.attachments = 'Maximum 5 files allowed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleRoleChange = (roleValue) => {
    setFormData(prev => ({
      ...prev,
      role: roleValue
    }));
    
    if (errors.role) {
      setErrors(prev => ({
        ...prev,
        role: ''
      }));
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const validFiles = [];
    const rejectedFiles = [];
    
    files.forEach(file => {
      if (file.size > maxSize) {
        rejectedFiles.push(`${file.name}: File too large (max 5MB)`);
      } else if (!allowedTypes.includes(file.type)) {
        rejectedFiles.push(`${file.name}: Unsupported file type`);
      } else {
        validFiles.push(file);
      }
    });

    // Show rejection messages if any
    if (rejectedFiles.length > 0) {
      setErrors(prev => ({
        ...prev,
        attachments: rejectedFiles.join(', ')
      }));
    } else {
      setErrors(prev => ({
        ...prev,
        attachments: ''
      }));
    }

    // Check total file limit
    const totalFiles = formData.attachments.length + validFiles.length;
    if (totalFiles > 5) {
      setErrors(prev => ({
        ...prev,
        attachments: 'Maximum 5 files allowed. Please remove some files first.'
      }));
      return;
    }

    // Add valid files
    if (validFiles.length > 0) {
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...validFiles]
      }));
    }
  };

  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
    
    // Clear attachment errors when files are removed
    if (errors.attachments) {
      setErrors(prev => ({
        ...prev,
        attachments: ''
      }));
    }
  };

  // Collect browser and tracking information
  const collectBrowserInfo = () => {
    const browserInfo = {
      senderIP: null, // Will be collected server-side
      userAgent: navigator.userAgent,
      referrerUrl: document.referrer || window.location.href,
      utmSource: new URLSearchParams(window.location.search).get('utm_source'),
      utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
      utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign')
    };
    
    return browserInfo;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      // Scroll to first error
      const firstErrorField = Object.keys(errors)[0];
      const errorElement = document.getElementById(firstErrorField) || document.querySelector(`.${firstErrorField}`);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      console.log('🚀 Submitting contact form...');
      
      // Collect browser information
      const browserInfo = collectBrowserInfo();
      
      // Prepare submission data
      const submissionData = {
        ...formData,
        ...browserInfo,
        // Convert file objects to be handled by API
        attachments: formData.attachments.length > 0 ? formData.attachments : null
      };

      console.log('📝 Form data prepared:', {
        name: submissionData.name,
        email: submissionData.email,
        organization: submissionData.organization,
        role: submissionData.role,
        inquiryType: submissionData.inquiryType,
        subject: submissionData.subject,
        messageLength: submissionData.message.length,
        attachmentCount: submissionData.attachments ? submissionData.attachments.length : 0
      });

      // Submit via API
      const result = await sendContactEmail(submissionData);
      
      if (result.success) {
        console.log('✅ Contact form submitted successfully:', result.data);

        await visitorTracking.trackContactSubmission(
          formData.inquiryType || 'general-inquiry',
          formData.subject
        );
        
        setSubmitStatus('success');
        setShowForm(false); // Hide form on success
        
        // Reset form data
        setFormData({
          name: '',
          email: '',
          organization: '',
          role: '',
          inquiryType: '',
          subject: '',
          message: '',
          attachments: []
        });
        
        // Reset file input
        const fileInput = document.getElementById('attachments');
        if (fileInput) fileInput.value = '';
        
        // Scroll to success message
        setTimeout(() => {
          const successElement = document.querySelector('.success-message');
          if (successElement) {
            successElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
        
      } else {
        console.error('❌ Contact form submission failed:', result.error);
        setSubmitStatus('error');
        setErrors({ submit: result.error || 'Failed to send message. Please try again.' });
      }
      
    } catch (error) {
      console.error('❌ Contact form submission error:', error);
      setSubmitStatus('error');
      setErrors({ submit: 'Network error. Please check your connection and try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-clear success message and show form again after 10 seconds
  useEffect(() => {
    if (submitStatus === 'success') {
      const timer = setTimeout(() => {
        setSubmitStatus(null);
        setShowForm(true);
      }, 10000); // 10 seconds

      return () => clearTimeout(timer);
    }
  }, [submitStatus]);

  return (
    <div className="contact-form-container glass-card">
      {/* Success Message - Creative Design */}
      {submitStatus === 'success' && (
        <div className="status-message success-message animate-fade-in">
          <div className="success-content">
            <div className="success-icon-large">🎉</div>
            <h3 className="success-title">Message Sent Successfully!</h3>
            <p className="success-text">
              Thank you for reaching out to me, I will reply to you as soon as possible!!
            </p>
            <div className="success-details">
              <p>✅ Your message has been delivered</p>
              <p>📧 Email notification sent</p>
              <p>⏰ Expect a response within 24-48 hours</p>
            </div>
            <button 
              onClick={() => { setSubmitStatus(null); setShowForm(true); }}
              className="back-to-form-button neon-button"
            >
              Send Another Message
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {submitStatus === 'error' && (
        <div className="status-message error-message">
          <span className="status-icon">⚠️</span>
          <div>
            <strong>Submission Failed</strong>
            <p>{errors.submit || 'Sorry, there was an error sending your message. Please try again.'}</p>
          </div>
        </div>
      )}

      {/* Contact Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="contact-form">
          {/* Name & Email Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name" className="form-label">
                Full Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`form-input ${errors.name ? 'error' : ''}`}
                placeholder="Your full name"
                autoComplete="name"
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Professional Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`form-input ${errors.email ? 'error' : ''}`}
                placeholder="your.email@company.com"
                autoComplete="email"
              />
              {errors.email && <span className="error-text">{errors.email}</span>}
            </div>
          </div>

          {/* Organization */}
          <div className="form-group">
            <label htmlFor="organization" className="form-label">
              Organization/University Name *
            </label>
            <input
              type="text"
              id="organization"
              name="organization"
              value={formData.organization}
              onChange={handleInputChange}
              className={`form-input ${errors.organization ? 'error' : ''}`}
              placeholder="Your company, startup, or university name"
              autoComplete="organization"
            />
            {errors.organization && <span className="error-text">{errors.organization}</span>}
          </div>

          {/* Role Selection */}
          <div className="form-group">
            <label className="form-label">
              Your Role/Position *
            </label>
            <div className="role-options">
              {roleOptions.map(option => (
                <label key={option.value} className="role-option">
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={formData.role === option.value}
                    onChange={() => handleRoleChange(option.value)}
                    className="role-radio"
                  />
                  <span className="role-label">{option.label}</span>
                </label>
              ))}
            </div>
            {errors.role && <span className="error-text">{errors.role}</span>}
          </div>

          {/* Inquiry Type */}
          <div className="form-group">
            <label htmlFor="inquiryType" className="form-label">
              What brings you here? *
            </label>
            <select
              id="inquiryType"
              name="inquiryType"
              value={formData.inquiryType}
              onChange={handleInputChange}
              className={`form-select ${errors.inquiryType ? 'error' : ''}`}
            >
              {inquiryTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors.inquiryType && <span className="error-text">{errors.inquiryType}</span>}
          </div>

          {/* Subject */}
          <div className="form-group">
            <label htmlFor="subject" className="form-label">
              Subject *
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleInputChange}
              className={`form-input ${errors.subject ? 'error' : ''}`}
              placeholder="Brief, clear subject line (e.g., 'Senior React Developer Position', 'ML Project Collaboration')"
              maxLength="100"
            />
            <div className="character-count">
              {formData.subject.length}/100 characters
            </div>
            {errors.subject && <span className="error-text">{errors.subject}</span>}
          </div>

          {/* Message */}
          <div className="form-group">
            <label htmlFor="message" className="form-label">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              className={`form-textarea ${errors.message ? 'error' : ''}`}
              placeholder="Please share details about:
• The opportunity/role/project
• Key requirements or technologies
• Timeline and next steps
• Any specific questions

For collaborations: project scope, your background, and how we can work together."
              rows="8"
              maxLength="2000"
            />
            <div className="character-count">
              {formData.message.length}/2000 characters (minimum 20)
            </div>
            {errors.message && <span className="error-text">{errors.message}</span>}
          </div>

          {/* File Attachments */}
          <div className="form-group">
            <label htmlFor="attachments" className="form-label">
              Supporting Documents (Optional)
            </label>
            <div className="file-upload-container">
              <input
                type="file"
                id="attachments"
                multiple
                onChange={handleFileChange}
                className="file-input"
                accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx"
              />
              <label htmlFor="attachments" className="file-upload-label">
                <span className="upload-icon">📎</span>
                <span>Choose Files</span>
              </label>
              <div className="file-info">
                Job descriptions, project briefs, technical specs, or portfolio samples
                <br />
                <small>(PDF, Images, Word docs • Max 5MB each • Up to 5 files)</small>
              </div>
            </div>

            {/* Attachment List */}
            {formData.attachments.length > 0 && (
              <div className="attachments-list">
                <h4 className="attachments-title">Attached Files ({formData.attachments.length}/5):</h4>
                {formData.attachments.map((file, index) => (
                  <div key={index} className="attachment-item">
                    <div className="attachment-info">
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="remove-attachment"
                      title="Remove file"
                    >
                      ✗
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {errors.attachments && <span className="error-text">{errors.attachments}</span>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`submit-button neon-button ${isSubmitting ? 'submitting' : ''}`}
          >
            {isSubmitting ? (
              <>
                <span className="loading-spinner"></span>
                <span>Sending Message...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Send Message</span>
              </>
            )}
          </button>

          {/* Professional Footer Note */}
          <div className="form-footer-note">
            <p>
              <strong>📧 Direct Response:</strong> I personally read and respond to every message. 
              For urgent matters, feel free to connect with me on{' '}
              <a href="https://linkedin.com/in/raunak-choudhary" target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>.
            </p>
          </div>
        </form>
      )}
    </div>
  );
};

export default ContactForm;