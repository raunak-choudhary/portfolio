import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './CertificationsManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const CertificationsManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: certificationsData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('certifications', {}, { 
    orderBy: [
      { column: 'issue_date', ascending: false }, // Sort by issue date (newest first)
      { column: 'order_index', ascending: true }
    ],
    cacheKey: 'certifications-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedCertification, setSelectedCertification] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFeatured, setFilterFeatured] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    certification_number: '',
    title: '',
    issuer: '',
    issuer_logo_url: '',
    issue_date: '',
    expiry_date: '',
    credential_id: '',
    credential_url: '',
    badge_image_url: '',
    certificate_pdf_url: '',
    description: '',
    skills_covered: [],
    certification_type: '',
    difficulty_level: '',
    is_featured: false,
    verification_status: 'verified',
    order_index: null,
    status: 'active'
  });

  // UI state management
  const [uiState, setUiState] = useState({
    isSaving: false,
    hasChanges: false,
    showPreview: false,
    saveStatus: null, // 'success', 'error', null
    isPostSave: false,
    statusMessageContent: ''
  });

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});

  // File upload states
  const [issuerLogoUploading, setIssuerLogoUploading] = useState(false);
  const [badgeImageUploading, setBadgeImageUploading] = useState(false);
  const [certificatePdfUploading, setCertificatePdfUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [certificationToDelete, setCertificationToDelete] = useState(null);
  const [showIssuerLogoDeleteModal, setShowIssuerLogoDeleteModal] = useState(false);
  const [showBadgeDeleteModal, setShowBadgeDeleteModal] = useState(false);
  const [showCertPdfDeleteModal, setShowCertPdfDeleteModal] = useState(false);

  // Skills input state
  const [currentSkill, setCurrentSkill] = useState('');

  // Certification types
  const certificationTypes = [
    'Professional',
    'Academic',
    'Vendor',
    'Industry',
    'Government',
    'Technical',
    'Management',
    'Compliance',
    'Security',
    'Other'
  ];

  // Difficulty levels
  const difficultyLevels = [
    'Foundational',
    'Associate',
    'Professional',
    'Expert',
    'Specialist'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    issuer: formData.issuer.length,
    credential_id: formData.credential_id.length,
    credential_url: formData.credential_url.length,
    description: formData.description.length,
    certification_type: formData.certification_type.length,
    difficulty_level: formData.difficulty_level.length
  }), [formData]);

  const filteredCertifications = useMemo(() => {
    if (!certificationsData) return [];
    
    return certificationsData.filter(certification => {
      const matchesSearch = certification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           certification.issuer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           certification.credential_id?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || certification.status === filterStatus;
      const matchesFeatured = filterFeatured === 'all' || 
                             (filterFeatured === 'true' && certification.is_featured) ||
                             (filterFeatured === 'false' && !certification.is_featured);
      
      return matchesSearch && matchesStatus && matchesFeatured;
    });
  }, [certificationsData, searchTerm, filterStatus, filterFeatured]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedCertification && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.title.trim() !== '' || 
             formData.issuer.trim() !== '' ||
             formData.description.trim() !== '' ||
             formData.credential_id.trim() !== '' ||
             formData.skills_covered.length > 0;
    }

    if (viewMode === 'edit' && selectedCertification) {
      return (
        formData.certification_number !== (selectedCertification.certification_number || '') ||
        formData.title !== (selectedCertification.title || '') ||
        formData.issuer !== (selectedCertification.issuer || '') ||
        formData.issuer_logo_url !== (selectedCertification.issuer_logo_url || '') ||
        formData.issue_date !== (selectedCertification.issue_date || '') ||
        formData.expiry_date !== (selectedCertification.expiry_date || '') ||
        formData.credential_id !== (selectedCertification.credential_id || '') ||
        formData.credential_url !== (selectedCertification.credential_url || '') ||
        formData.badge_image_url !== (selectedCertification.badge_image_url || '') ||
        formData.certificate_pdf_url !== (selectedCertification.certificate_pdf_url || '') ||
        formData.description !== (selectedCertification.description || '') ||
        JSON.stringify(formData.skills_covered) !== JSON.stringify(selectedCertification.skills_covered || []) ||
        formData.certification_type !== (selectedCertification.certification_type || '') ||
        formData.difficulty_level !== (selectedCertification.difficulty_level || '') ||
        formData.is_featured !== (selectedCertification.is_featured || false) ||
        formData.verification_status !== (selectedCertification.verification_status || 'verified') ||
        formData.status !== (selectedCertification.status || 'active')
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedCertification, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing certification
  useEffect(() => {
    if (viewMode === 'edit' && selectedCertification) {
      const newFormData = {
        certification_number: selectedCertification.certification_number || '',
        title: selectedCertification.title || '',
        issuer: selectedCertification.issuer || '',
        issuer_logo_url: selectedCertification.issuer_logo_url || '',
        issue_date: selectedCertification.issue_date || '',
        expiry_date: selectedCertification.expiry_date || '',
        credential_id: selectedCertification.credential_id || '',
        credential_url: selectedCertification.credential_url || '',
        badge_image_url: selectedCertification.badge_image_url || '',
        certificate_pdf_url: selectedCertification.certificate_pdf_url || '',
        description: selectedCertification.description || '',
        skills_covered: selectedCertification.skills_covered || [],
        certification_type: selectedCertification.certification_type || '',
        difficulty_level: selectedCertification.difficulty_level || '',
        is_featured: selectedCertification.is_featured || false,
        verification_status: selectedCertification.verification_status || 'verified',
        order_index: selectedCertification.order_index,
        status: selectedCertification.status || 'active'
      };
      
      setFormData(newFormData);
      setValidationErrors({});
      
      // Preserve success message if we're in post-save state
      setUiState(prev => {
        if (prev.isPostSave && prev.saveStatus === 'success') {
          return {
            ...prev,
            hasChanges: false
          };
        } else {
          return {
            ...prev,
            hasChanges: false,
            saveStatus: null,
            isPostSave: false
          };
        }
      });
    }
  }, [viewMode, selectedCertification]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        certification_number: '',
        title: '',
        issuer: '',
        issuer_logo_url: '',
        issue_date: '',
        expiry_date: '',
        credential_id: '',
        credential_url: '',
        badge_image_url: '',
        certificate_pdf_url: '',
        description: '',
        skills_covered: [],
        certification_type: '',
        difficulty_level: '',
        is_featured: false,
        verification_status: 'verified',
        order_index: null,
        status: 'active'
      });
      setValidationErrors({});
      setCurrentSkill('');
      setUiState(prev => ({
        ...prev,
        hasChanges: false,
        saveStatus: null,
        isPostSave: false
      }));
    }
  }, [viewMode]);

  // Auto-hide status messages
  useEffect(() => {
    if (uiState.saveStatus) {
      let timeout;
      
      if (uiState.saveStatus === 'success') {
        timeout = viewMode === 'list' ? 12000 : 3000;
      } else {
        timeout = 5000;
      }
      
      const timer = setTimeout(() => {
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: null,
          isPostSave: false
        }));
      }, timeout);
      
      return () => clearTimeout(timer);
    }
  }, [uiState.saveStatus, viewMode]);

  // ============================================================================
  // FORM HANDLING - OPTIMIZED AND STANDARDIZED
  // ============================================================================
  
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setUiState(prev => ({ ...prev, hasChanges: true }));
    
    // Clear field-specific validation errors
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors]);

  // Skills management
  const handleAddSkill = useCallback(() => {
    const skillTrimmed = currentSkill.trim();
    if (skillTrimmed && !formData.skills_covered.includes(skillTrimmed)) {
      handleInputChange('skills_covered', [...formData.skills_covered, skillTrimmed]);
      setCurrentSkill('');
    }
  }, [currentSkill, formData.skills_covered, handleInputChange]);

  const handleRemoveSkill = useCallback((skillToRemove) => {
    handleInputChange('skills_covered', formData.skills_covered.filter(skill => skill !== skillToRemove));
  }, [formData.skills_covered, handleInputChange]);

  // ============================================================================
  // FILE UPLOAD HANDLING
  // ============================================================================
  
  // Issuer Logo Upload
  const handleIssuerLogoUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        issuer_logo: 'File size must be less than 5MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        issuer_logo: 'Only JPEG, PNG, and WebP formats are allowed'
      }));
      return;
    }

    setIssuerLogoUploading(true);
    setUploadProgress(0);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const issuerName = formData.issuer || 'issuer';
      const sanitizedIssuer = issuerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `issuer-logo-${sanitizedIssuer}-${timestamp}.${fileExtension}`;
      const filePath = `issuer_logos/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('certification-badges')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('certification-badges')
        .getPublicUrl(filePath);

      // Update form data with logo URL
      handleInputChange('issuer_logo_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.issuer_logo;
        return newErrors;
      });

    } catch (error) {
      console.error('Issuer logo upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        issuer_logo: error.message || 'Failed to upload issuer logo'
      }));
    } finally {
      setIssuerLogoUploading(false);
      setUploadProgress(0);
    }
  }, [formData.issuer, handleInputChange]);

  // Badge Image Upload
  const handleBadgeImageUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        badge_image: 'File size must be less than 5MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        badge_image: 'Only JPEG, PNG, and WebP formats are allowed'
      }));
      return;
    }

    setBadgeImageUploading(true);
    setUploadProgress(0);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const certTitle = formData.title || 'badge';
      const sanitizedTitle = certTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `badge-${sanitizedTitle}-${timestamp}.${fileExtension}`;
      const filePath = `badges/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('certification-badges')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('certification-badges')
        .getPublicUrl(filePath);

      // Update form data with badge URL
      handleInputChange('badge_image_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.badge_image;
        return newErrors;
      });

    } catch (error) {
      console.error('Badge image upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        badge_image: error.message || 'Failed to upload badge image'
      }));
    } finally {
      setBadgeImageUploading(false);
      setUploadProgress(0);
    }
  }, [formData.title, handleInputChange]);

  // Certificate PDF Upload
  const handleCertificatePdfUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB for PDFs
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        certificate_pdf: 'File size must be less than 10MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        certificate_pdf: 'Only PDF, JPEG, and PNG formats are allowed'
      }));
      return;
    }

    setCertificatePdfUploading(true);
    setUploadProgress(0);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const certTitle = formData.title || 'certificate';
      const sanitizedTitle = certTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `certificate-${sanitizedTitle}-${timestamp}.${fileExtension}`;
      const filePath = `certifications/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('certification-badges')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('certification-badges')
        .getPublicUrl(filePath);

      // Update form data with certificate URL
      handleInputChange('certificate_pdf_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.certificate_pdf;
        return newErrors;
      });

    } catch (error) {
      console.error('Certificate PDF upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificate_pdf: error.message || 'Failed to upload certificate PDF'
      }));
    } finally {
      setCertificatePdfUploading(false);
      setUploadProgress(0);
    }
  }, [formData.title, handleInputChange]);

  // File removal handlers
  const removeIssuerLogo = useCallback(() => {
    setShowIssuerLogoDeleteModal(true);
  }, []);

  const removeBadgeImage = useCallback(() => {
    setShowBadgeDeleteModal(true);
  }, []);

  const removeCertificatePdf = useCallback(() => {
    setShowCertPdfDeleteModal(true);
  }, []);

  // File deletion confirmation handlers
  const confirmIssuerLogoDelete = useCallback(async () => {
    if (!formData.issuer_logo_url) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = formData.issuer_logo_url.split('/storage/v1/object/public/certification-badges/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('certification-badges')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete file from storage:', storageError);
        }
      }

      // Remove logo URL from form
      handleInputChange('issuer_logo_url', '');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Issuer logo deleted successfully.'
      }));

    } catch (error) {
      console.error('Issuer logo delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        issuer_logo: error.message || 'Failed to delete issuer logo'
      }));
    } finally {
      setShowIssuerLogoDeleteModal(false);
    }
  }, [formData.issuer_logo_url, handleInputChange]);

  const confirmBadgeImageDelete = useCallback(async () => {
    if (!formData.badge_image_url) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = formData.badge_image_url.split('/storage/v1/object/public/certification-badges/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('certification-badges')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete file from storage:', storageError);
        }
      }

      // Remove badge URL from form
      handleInputChange('badge_image_url', '');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Badge image deleted successfully.'
      }));

    } catch (error) {
      console.error('Badge image delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        badge_image: error.message || 'Failed to delete badge image'
      }));
    } finally {
      setShowBadgeDeleteModal(false);
    }
  }, [formData.badge_image_url, handleInputChange]);

  const confirmCertificatePdfDelete = useCallback(async () => {
    if (!formData.certificate_pdf_url) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = formData.certificate_pdf_url.split('/storage/v1/object/public/certification-badges/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('certification-badges')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete file from storage:', storageError);
        }
      }

      // Remove certificate URL from form
      handleInputChange('certificate_pdf_url', '');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Certificate PDF deleted successfully.'
      }));

    } catch (error) {
      console.error('Certificate PDF delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificate_pdf: error.message || 'Failed to delete certificate PDF'
      }));
    } finally {
      setShowCertPdfDeleteModal(false);
    }
  }, [formData.certificate_pdf_url, handleInputChange]);

  const cancelIssuerLogoDelete = useCallback(() => {
    setShowIssuerLogoDeleteModal(false);
  }, []);

  const cancelBadgeImageDelete = useCallback(() => {
    setShowBadgeDeleteModal(false);
  }, []);

  const cancelCertificatePdfDelete = useCallback(() => {
    setShowCertPdfDeleteModal(false);
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Title validation (required, 3-200 chars)
    const titleTrimmed = formData.title.trim();
    if (!titleTrimmed) {
      errors.title = 'Certification title is required';
    } else if (titleTrimmed.length < 3) {
      errors.title = 'Certification title must be at least 3 characters';
    } else if (titleTrimmed.length > 200) {
      errors.title = 'Certification title must be less than 200 characters';
    }

    // Issuer validation (required, 2-200 chars)
    const issuerTrimmed = formData.issuer.trim();
    if (!issuerTrimmed) {
      errors.issuer = 'Issuing organization is required';
    } else if (issuerTrimmed.length < 2) {
      errors.issuer = 'Issuing organization must be at least 2 characters';
    } else if (issuerTrimmed.length > 200) {
      errors.issuer = 'Issuing organization must be less than 200 characters';
    }

    // Description validation (optional, max 1000 chars)
    if (formData.description && formData.description.length > 1000) {
      errors.description = 'Description must be less than 1000 characters';
    }

    // Credential ID validation (optional, max 100 chars)
    if (formData.credential_id && formData.credential_id.length > 100) {
      errors.credential_id = 'Credential ID must be less than 100 characters';
    }

    // Credential URL validation
    if (formData.credential_url && formData.credential_url.trim() !== '') {
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
      if (!urlPattern.test(formData.credential_url)) {
        errors.credential_url = 'Please enter a valid URL';
      }
    }

    // Certification type validation (optional, max 50 chars)
    if (formData.certification_type && formData.certification_type.length > 50) {
      errors.certification_type = 'Certification type must be less than 50 characters';
    }

    // Difficulty level validation (optional, max 50 chars)
    if (formData.difficulty_level && formData.difficulty_level.length > 50) {
      errors.difficulty_level = 'Difficulty level must be less than 50 characters';
    }

    // Date validations
    if (formData.issue_date && formData.expiry_date) {
      const issueDate = new Date(formData.issue_date);
      const expiryDate = new Date(formData.expiry_date);
      
      if (expiryDate <= issueDate) {
        errors.expiry_date = 'Expiry date must be after issue date';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING WORK EXPERIENCE MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Certification save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        certification_number: formData.certification_number ? parseInt(formData.certification_number) : null,
        title: formData.title.trim(),
        issuer: formData.issuer.trim(),
        issuer_logo_url: formData.issuer_logo_url || null,
        issue_date: formData.issue_date || null,
        expiry_date: formData.expiry_date || null,
        credential_id: formData.credential_id.trim() || null,
        credential_url: formData.credential_url.trim() || null,
        badge_image_url: formData.badge_image_url || null,
        certificate_pdf_url: formData.certificate_pdf_url || null,
        description: formData.description.trim() || null,
        skills_covered: formData.skills_covered.length > 0 ? formData.skills_covered : null,
        certification_type: formData.certification_type || null,
        difficulty_level: formData.difficulty_level || null,
        is_featured: formData.is_featured,
        verification_status: formData.verification_status,
        order_index: formData.order_index,
        status: formData.status
      };

      console.log('📤 Sending data to save:', saveData);
      
      // Import Supabase with service key for admin operations
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS)
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for admin operations');
      
      let result;
      
      if (viewMode === 'edit' && selectedCertification?.id) {
        // Update existing certification
        console.log('🔄 Updating existing certification with ID:', selectedCertification.id);
        const { data, error } = await supabaseAdmin
          .from('certifications')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedCertification.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update certification: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new certification
        console.log('➕ Creating new certification');
        const { data, error } = await supabaseAdmin
          .from('certifications')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create certification: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('certifications');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new certification, switch to list view after save
        if (viewMode === 'add') {
          setTimeout(() => {
            setViewMode('list');
            refetch();
          }, 1500);
        } else {
          // Refresh data after a brief delay
          setTimeout(() => {
            refetch();
          }, 100);
        }
        
      } else {
        console.log('❌ Save failed:', result);
        throw new Error(result?.error || result?.message || 'Failed to save certification');
      }
    } catch (error) {
      console.error('💥 Save error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Set error status
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      
    } finally {
      setUiState(prev => ({ ...prev, isSaving: false }));
    }
  }, [formData, selectedCertification, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new certification entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedCertification(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((certification) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedCertification?.id !== certification.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different certification? Changes will be lost.')) {
        return;
      }
    }
    setSelectedCertification(certification);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedCertification]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedCertification(null);
    setValidationErrors({});
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((certification) => {
    setCertificationToDelete(certification);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!certificationToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Delete associated files if exists
      const filesToDelete = [];
      
      if (certificationToDelete.issuer_logo_url) {
        const logoPath = certificationToDelete.issuer_logo_url.split('/storage/v1/object/public/certification-badges/')[1];
        if (logoPath) filesToDelete.push(logoPath);
      }
      
      if (certificationToDelete.badge_image_url) {
        const badgePath = certificationToDelete.badge_image_url.split('/storage/v1/object/public/certification-badges/')[1];
        if (badgePath) filesToDelete.push(badgePath);
      }
      
      if (certificationToDelete.certificate_pdf_url) {
        const certPath = certificationToDelete.certificate_pdf_url.split('/storage/v1/object/public/certification-badges/')[1];
        if (certPath) filesToDelete.push(certPath);
      }

      // Delete files from storage
      if (filesToDelete.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage
          .from('certification-badges')
          .remove(filesToDelete);

        if (storageError) {
          console.warn('⚠️ Some files may not have been deleted from storage:', storageError);
        }
      }

      const { error } = await supabaseAdmin
        .from('certifications')
        .delete()
        .eq('id', certificationToDelete.id);

      if (error) {
        throw new Error(`Failed to delete certification: ${error.message}`);
      }

      triggerPublicRefresh('certifications');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Certification "${certificationToDelete.title}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting certification: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setCertificationToDelete(null);
    }
  }, [certificationToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setCertificationToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // DATE FORMATTING UTILITIES
  // ============================================================================
  
  const formatCertificationDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  }, []);

  const isExpired = useCallback((expiryDate) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  }, []);

  const getExpiryStatus = useCallback((expiryDate) => {
    if (!expiryDate) return 'No Expiry';
    const expiry = new Date(expiryDate);
    const today = new Date();
    
    if (expiry < today) {
      return `Expired (${formatCertificationDate(expiryDate)})`;
    } else {
      const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 90) {
        return `Expires Soon (${formatCertificationDate(expiryDate)})`;
      }
      return formatCertificationDate(expiryDate);
    }
  }, [formatCertificationDate]);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !certificationsData) {
    return (
      <div className="certmgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading certifications...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="certmgr-content-manager">
      {/* Header Section */}
      <div className="certmgr-manager-header">
        <div className="certmgr-header-content">
          <h2 className="certmgr-manager-title">
            <span className="certmgr-title-icon">🏆</span>
            Certifications & Badges Management
          </h2>
          <p className="certmgr-manager-subtitle">
            Manage your professional certifications and badges
          </p>
        </div>

        <div className="certmgr-header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="certmgr-action-btn certmgr-add-btn certmgr-primary"
                onClick={handleAddNew}
                title="Add New Certification"
                type="button"
              >
                <span className="certmgr-btn-icon">➕</span>
                Add Certification
              </button>
            </>
          ) : (
            <>
              <button
                className="certmgr-action-btn certmgr-preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="certmgr-btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <div className="certmgr-edit-actions">
                <button
                  className="certmgr-action-btn certmgr-cancel-btn"
                  onClick={handleCancel}
                  disabled={uiState.isSaving}
                  title="Cancel Changes"
                  type="button"
                >
                  <span className="certmgr-btn-icon">❌</span>
                  Cancel
                </button>
                <button
                  className="certmgr-action-btn certmgr-save-btn certmgr-primary"
                  onClick={handleSave}
                  disabled={uiState.isSaving || !hasUnsavedChanges}
                  title="Save Changes"
                  type="button"
                >
                  {uiState.isSaving ? (
                    <>
                      <LoadingSpinner size="small" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <span className="certmgr-btn-icon">💾</span>
                      Save Certification
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {uiState.saveStatus && (
        <div className={`certmgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="certmgr-status-icon">✅</span>
              <div className="certmgr-status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Certification has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="certmgr-status-icon">❌</span>
              <div className="certmgr-status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save certification. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="certmgr-status-message certmgr-error" role="alert">
          <span className="certmgr-status-icon">⚠️</span>
          Error loading certifications: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Certification Confirmation Modal */}
      {showDeleteModal && certificationToDelete && (
        <div className="certmgr-modal-overlay">
          <div className="certmgr-modal-content certmgr-glass-card">
            <h3 className="certmgr-modal-title">
              <span className="certmgr-modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="certmgr-modal-text">
              Are you sure you want to delete the certification: <strong>"{certificationToDelete.title}"</strong>? 
              This action cannot be undone and will also delete any associated files (logo, badge, certificate).
            </p>
            <div className="certmgr-modal-actions">
              <button
                type="button"
                className="certmgr-action-btn certmgr-cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="certmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="certmgr-action-btn certmgr-delete-btn-confirm certmgr-primary"
                onClick={confirmDeleteAction}
              >
                <span className="certmgr-btn-icon">🗑️</span> Delete Certification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Issuer Logo Confirmation Modal */}
      {showIssuerLogoDeleteModal && (
        <div className="certmgr-modal-overlay">
          <div className="certmgr-modal-content certmgr-glass-card">
            <h3 className="certmgr-modal-title">
              <span className="certmgr-modal-icon">🏢</span> Confirm Logo Deletion
            </h3>
            <p className="certmgr-modal-text">
              Are you sure you want to delete the issuer logo? This action cannot be undone.
            </p>
            <div className="certmgr-modal-actions">
              <button
                type="button"
                className="certmgr-action-btn certmgr-cancel-btn"
                onClick={cancelIssuerLogoDelete}
              >
                <span className="certmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="certmgr-action-btn certmgr-delete-btn-confirm certmgr-primary"
                onClick={confirmIssuerLogoDelete}
              >
                <span className="certmgr-btn-icon">🗑️</span> Delete Logo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Badge Image Confirmation Modal */}
      {showBadgeDeleteModal && (
        <div className="certmgr-modal-overlay">
          <div className="certmgr-modal-content certmgr-glass-card">
            <h3 className="certmgr-modal-title">
              <span className="certmgr-modal-icon">🎖️</span> Confirm Badge Deletion
            </h3>
            <p className="certmgr-modal-text">
              Are you sure you want to delete the badge image? This action cannot be undone.
            </p>
            <div className="certmgr-modal-actions">
              <button
                type="button"
                className="certmgr-action-btn certmgr-cancel-btn"
                onClick={cancelBadgeImageDelete}
              >
                <span className="certmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="certmgr-action-btn certmgr-delete-btn-confirm certmgr-primary"
                onClick={confirmBadgeImageDelete}
              >
                <span className="certmgr-btn-icon">🗑️</span> Delete Badge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Certificate PDF Confirmation Modal */}
      {showCertPdfDeleteModal && (
        <div className="certmgr-modal-overlay">
          <div className="certmgr-modal-content certmgr-glass-card">
            <h3 className="certmgr-modal-title">
              <span className="certmgr-modal-icon">📄</span> Confirm Certificate Deletion
            </h3>
            <p className="certmgr-modal-text">
              Are you sure you want to delete the certificate PDF? This action cannot be undone.
            </p>
            <div className="certmgr-modal-actions">
              <button
                type="button"
                className="certmgr-action-btn certmgr-cancel-btn"
                onClick={cancelCertificatePdfDelete}
              >
                <span className="certmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="certmgr-action-btn certmgr-delete-btn-confirm certmgr-primary"
                onClick={confirmCertificatePdfDelete}
              >
                <span className="certmgr-btn-icon">🗑️</span> Delete Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`certmgr-manager-content ${uiState.showPreview ? 'certmgr-with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="certmgr-list-section">
            <div className="certmgr-list-container certmgr-glass-card">
              
              {/* Search and Filters */}
              <div className="certmgr-list-controls">
                <div className="certmgr-search-section">
                  <div className="certmgr-search-wrapper">
                    <span className="certmgr-search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search certifications by title, issuer, or credential ID..."
                      className="certmgr-search-input"
                    />
                  </div>
                </div>
                
                <div className="certmgr-filters-section">
                  <select
                    value={filterFeatured}
                    onChange={(e) => setFilterFeatured(e.target.value)}
                    className="certmgr-filter-select"
                  >
                    <option value="all">All Featured Status</option>
                    <option value="true">Featured</option>
                    <option value="false">Not Featured</option>
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="certmgr-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Certifications Table */}
              <div className="certmgr-table-wrapper">
                {filteredCertifications.length === 0 ? (
                  <div className="certmgr-no-data-message">
                    <div className="certmgr-no-data-icon">🎓</div>
                    <h3>No Certifications Found</h3>
                    <p>
                      {certificationsData?.length === 0 
                        ? 'No certifications have been created yet. Click "Add Certification" to get started.'
                        : 'No certifications match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="certmgr-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Issuer</th>
                        <th>Issue Date</th>
                        <th>Expiry Date</th>
                        <th>Featured</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCertifications.map((certification, index) => (
                        <tr key={certification.id || index} className={`certmgr-table-row ${isExpired(certification.expiry_date) ? 'certmgr-expired' : ''}`}>
                          <td className="certmgr-certification-title">
                            <div className="certmgr-title-content">
                              <h4 className="certmgr-title-text">{certification.title}</h4>
                            </div>
                          </td>
                          
                          <td className="certmgr-issuer">
                            <span className="certmgr-issuer-text">{certification.issuer}</span>
                          </td>
                          
                          <td className="certmgr-date">
                            <span className="certmgr-date-text">
                              {formatCertificationDate(certification.issue_date)}
                            </span>
                          </td>
                          
                          <td className="certmgr-expiry">
                            <span className={`certmgr-expiry-text ${isExpired(certification.expiry_date) ? 'certmgr-expired-text' : ''}`}>
                              {getExpiryStatus(certification.expiry_date)}
                            </span>
                          </td>
                          
                          <td className="certmgr-featured">
                            <span className={`certmgr-featured-text ${certification.is_featured ? 'certmgr-featured-true' : 'certmgr-featured-false'}`}>
                              {certification.is_featured ? 'TRUE' : 'FALSE'}
                            </span>
                          </td>
                          
                          <td className="certmgr-status">
                            <span className={`certmgr-status-badge certmgr-status-${certification.status}`}>
                              {certification.status?.toUpperCase() || 'ACTIVE'}
                            </span>
                          </td>
                          
                          <td className="certmgr-actions">
                            <div className="certmgr-action-buttons">
                              <button
                                className="certmgr-action-btn-mini certmgr-edit-btn"
                                onClick={() => handleEdit(certification)}
                                title="Edit Certification"
                              >
                                ✏️
                              </button>
                              <button
                                className="certmgr-action-btn-mini certmgr-delete-btn"
                                onClick={() => handleDelete(certification)}
                                title="Delete Certification"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* Certifications Summary */}
              {certificationsData && certificationsData.length > 0 && (
                <div className="certmgr-summary">
                  <div className="certmgr-summary-stats">
                    <span className="certmgr-stat-item">
                      <strong>{certificationsData.length}</strong> total certifications
                    </span>
                    <span className="certmgr-stat-item">
                      <strong>{certificationsData.filter(c => c.is_featured).length}</strong> featured certifications
                    </span>
                    <span className="certmgr-stat-item">
                      <strong>{certificationsData.filter(c => c.status === 'active').length}</strong> active certifications
                    </span>
                    <span className="certmgr-stat-item">
                      <strong>{certificationsData.filter(c => isExpired(c.expiry_date)).length}</strong> expired certifications
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="certmgr-form-section">
            <div className="certmgr-form-container certmgr-glass-card">
              
              {/* Form Title */}
              <div className="certmgr-form-title-section">
                <h3 className="certmgr-form-title">
                  {viewMode === 'add' ? 'Add New Certification' : `Edit: ${selectedCertification?.title}`}
                </h3>
                <p className="certmgr-form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new certification entry for your portfolio'
                    : 'Update certification information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="certmgr-form-section-group">
                <h4 className="certmgr-section-title">
                  <span className="certmgr-section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="certmgr-form-row">
                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-certification-number" className="certmgr-form-label">
                        Certification Number
                      </label>
                    </div>
                    <input
                      id="certmgr-certification-number"
                      type="number"
                      value={formData.certification_number}
                      onChange={(e) => handleInputChange('certification_number', e.target.value)}
                      className="certmgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                  </div>

                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-status" className="certmgr-form-label">
                        Record Status
                      </label>
                    </div>
                    <select
                      id="certmgr-status"
                      value={formData.status}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      className="certmgr-form-select"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>

                <div className="certmgr-form-group">
                  <div className="certmgr-form-label-wrapper">
                    <label htmlFor="certmgr-title" className="certmgr-form-label certmgr-required">
                      Certification Title
                    </label>
                    <span className="certmgr-char-count">
                      {characterCounts.title}/200
                    </span>
                  </div>
                  <input
                    id="certmgr-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className={`certmgr-form-input ${validationErrors.title ? 'certmgr-error' : ''}`}
                    placeholder="e.g., AWS Certified Cloud Practitioner"
                    maxLength={200}
                    aria-describedby={validationErrors.title ? 'certmgr-title-error' : undefined}
                  />
                  {validationErrors.title && (
                    <span id="certmgr-title-error" className="certmgr-error-text" role="alert">
                      {validationErrors.title}
                    </span>
                  )}
                </div>

                <div className="certmgr-form-group">
                  <div className="certmgr-form-label-wrapper">
                    <label htmlFor="certmgr-issuer" className="certmgr-form-label certmgr-required">
                      Issuing Organization
                    </label>
                    <span className="certmgr-char-count">
                      {characterCounts.issuer}/200
                    </span>
                  </div>
                  <input
                    id="certmgr-issuer"
                    type="text"
                    value={formData.issuer}
                    onChange={(e) => handleInputChange('issuer', e.target.value)}
                    className={`certmgr-form-input ${validationErrors.issuer ? 'certmgr-error' : ''}`}
                    placeholder="e.g., Amazon Web Services"
                    maxLength={200}
                    aria-describedby={validationErrors.issuer ? 'certmgr-issuer-error' : undefined}
                  />
                  {validationErrors.issuer && (
                    <span id="certmgr-issuer-error" className="certmgr-error-text" role="alert">
                      {validationErrors.issuer}
                    </span>
                  )}
                </div>

                <div className="certmgr-form-row">
                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-issue-date" className="certmgr-form-label">
                        Issue Date
                      </label>
                    </div>
                    <input
                      id="certmgr-issue-date"
                      type="date"
                      value={formData.issue_date}
                      onChange={(e) => handleInputChange('issue_date', e.target.value)}
                      className="certmgr-form-input"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>

                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-expiry-date" className="certmgr-form-label">
                        Expiry Date
                      </label>
                    </div>
                    <input
                      id="certmgr-expiry-date"
                      type="date"
                      value={formData.expiry_date}
                      onChange={(e) => handleInputChange('expiry_date', e.target.value)}
                      className={`certmgr-form-input ${validationErrors.expiry_date ? 'certmgr-error' : ''}`}
                      min={formData.issue_date || undefined}
                    />
                    {validationErrors.expiry_date && (
                      <span className="certmgr-error-text" role="alert">
                        {validationErrors.expiry_date}
                      </span>
                    )}
                    <p className="certmgr-form-help">
                      Leave empty if certification does not expire
                    </p>
                  </div>
                </div>
              </div>

              {/* Credential Information Section */}
              <div className="certmgr-form-section-group">
                <h4 className="certmgr-section-title">
                  <span className="certmgr-section-icon">🔐</span>
                  Credential Information
                </h4>
                
                <div className="certmgr-form-group">
                  <div className="certmgr-form-label-wrapper">
                    <label htmlFor="certmgr-credential-id" className="certmgr-form-label">
                      Credential ID
                    </label>
                    <span className="certmgr-char-count">
                      {characterCounts.credential_id}/100
                    </span>
                  </div>
                  <input
                    id="certmgr-credential-id"
                    type="text"
                    value={formData.credential_id}
                    onChange={(e) => handleInputChange('credential_id', e.target.value)}
                    className={`certmgr-form-input ${validationErrors.credential_id ? 'certmgr-error' : ''}`}
                    placeholder="e.g., AWS-CCP-2023-12345"
                    maxLength={100}
                  />
                  {validationErrors.credential_id && (
                    <span className="certmgr-error-text" role="alert">
                      {validationErrors.credential_id}
                    </span>
                  )}
                </div>

                <div className="certmgr-form-group">
                  <div className="certmgr-form-label-wrapper">
                    <label htmlFor="certmgr-credential-url" className="certmgr-form-label">
                      Verification URL
                    </label>
                    <span className="certmgr-char-count">
                      {characterCounts.credential_url}/500
                    </span>
                  </div>
                  <input
                    id="certmgr-credential-url"
                    type="url"
                    value={formData.credential_url}
                    onChange={(e) => handleInputChange('credential_url', e.target.value)}
                    className={`certmgr-form-input ${validationErrors.credential_url ? 'certmgr-error' : ''}`}
                    placeholder="https://verify.certification.com/..."
                    maxLength={500}
                  />
                  {validationErrors.credential_url && (
                    <span className="certmgr-error-text" role="alert">
                      {validationErrors.credential_url}
                    </span>
                  )}
                </div>
              </div>

              {/* Description & Skills Section */}
              <div className="certmgr-form-section-group">
                <h4 className="certmgr-section-title">
                  <span className="certmgr-section-icon">📝</span>
                  Description & Skills
                </h4>
                
                <div className="certmgr-form-group">
                  <div className="certmgr-form-label-wrapper">
                    <label htmlFor="certmgr-description" className="certmgr-form-label">
                      Description
                    </label>
                    <span className="certmgr-char-count">
                      {characterCounts.description}/1000
                    </span>
                  </div>
                  <textarea
                    id="certmgr-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`certmgr-form-textarea ${validationErrors.description ? 'certmgr-error' : ''}`}
                    placeholder="Brief description of the certification..."
                    rows={4}
                    maxLength={1000}
                  />
                  {validationErrors.description && (
                    <span className="certmgr-error-text" role="alert">
                      {validationErrors.description}
                    </span>
                  )}
                </div>

                <div className="certmgr-form-group">
                  <div className="certmgr-form-label-wrapper">
                    <label htmlFor="certmgr-skills" className="certmgr-form-label">
                      Skills Covered
                    </label>
                  </div>
                  <div className="certmgr-skills-input-wrapper">
                    <input
                      id="certmgr-skills"
                      type="text"
                      value={currentSkill}
                      onChange={(e) => setCurrentSkill(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSkill();
                        }
                      }}
                      className="certmgr-form-input certmgr-skills-input"
                      placeholder="Type skill and press Enter"
                    />
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      className="certmgr-add-skill-btn"
                      title="Add skill"
                    >
                      ➕
                    </button>
                  </div>
                  {formData.skills_covered.length > 0 && (
                    <div className="certmgr-skills-list">
                      {formData.skills_covered.map((skill, index) => (
                        <span key={index} className="certmgr-skill-tag">
                          {skill}
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(skill)}
                            className="certmgr-remove-skill-btn"
                            title="Remove skill"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Files Upload Section */}
              <div className="certmgr-form-section-group">
                <h4 className="certmgr-section-title">
                  <span className="certmgr-section-icon">📁</span>
                  Files & Documentation
                </h4>
                
                {/* Issuer Logo */}
                <div className="certmgr-upload-group">
                  <label className="certmgr-upload-label">Issuer Logo</label>
                  {formData.issuer_logo_url ? (
                    <div className="certmgr-current-file">
                      <div className="certmgr-file-preview">
                        <div className="certmgr-file-info">
                          <span className="certmgr-file-icon">🏢</span>
                          <span className="certmgr-file-text">Logo uploaded</span>
                        </div>
                        <div className="certmgr-file-actions">
                          <a 
                            href={formData.issuer_logo_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="certmgr-view-file-btn"
                            title="View logo"
                          >
                            👁️ View
                          </a>
                          <button
                            type="button"
                            onClick={removeIssuerLogo}
                            className="certmgr-remove-file-btn"
                            title="Remove logo"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="certmgr-upload-section">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                        onChange={(e) => e.target.files[0] && handleIssuerLogoUpload(e.target.files[0])}
                        disabled={issuerLogoUploading}
                        className="certmgr-file-input"
                        id="certmgr-issuer-logo-upload"
                      />
                      <label htmlFor="certmgr-issuer-logo-upload" className="certmgr-upload-btn">
                        {issuerLogoUploading ? (
                          <>
                            <LoadingSpinner size="small" />
                            Uploading... {Math.round(uploadProgress)}%
                          </>
                        ) : (
                          <>
                            <span className="certmgr-btn-icon">🏢</span>
                            Upload Logo
                          </>
                        )}
                      </label>
                      <p className="certmgr-upload-help">
                        Upload issuer logo (JPEG, PNG, WebP, max 5MB)
                      </p>
                    </div>
                  )}
                  {validationErrors.issuer_logo && (
                    <span className="certmgr-error-text" role="alert">
                      {validationErrors.issuer_logo}
                    </span>
                  )}
                </div>

                {/* Badge Image */}
                <div className="certmgr-upload-group">
                  <label className="certmgr-upload-label">Badge Image</label>
                  {formData.badge_image_url ? (
                    <div className="certmgr-current-file">
                      <div className="certmgr-file-preview">
                        <div className="certmgr-file-info">
                          <span className="certmgr-file-icon">🎖️</span>
                          <span className="certmgr-file-text">Badge uploaded</span>
                        </div>
                        <div className="certmgr-file-actions">
                          <a 
                            href={formData.badge_image_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="certmgr-view-file-btn"
                            title="View badge"
                          >
                            👁️ View
                          </a>
                          <button
                            type="button"
                            onClick={removeBadgeImage}
                            className="certmgr-remove-file-btn"
                            title="Remove badge"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="certmgr-upload-section">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                        onChange={(e) => e.target.files[0] && handleBadgeImageUpload(e.target.files[0])}
                        disabled={badgeImageUploading}
                        className="certmgr-file-input"
                        id="certmgr-badge-image-upload"
                      />
                      <label htmlFor="certmgr-badge-image-upload" className="certmgr-upload-btn">
                        {badgeImageUploading ? (
                          <>
                            <LoadingSpinner size="small" />
                            Uploading... {Math.round(uploadProgress)}%
                          </>
                        ) : (
                          <>
                            <span className="certmgr-btn-icon">🎖️</span>
                            Upload Badge
                          </>
                        )}
                      </label>
                      <p className="certmgr-upload-help">
                        Upload badge image (JPEG, PNG, WebP, max 5MB)
                      </p>
                    </div>
                  )}
                  {validationErrors.badge_image && (
                    <span className="certmgr-error-text" role="alert">
                      {validationErrors.badge_image}
                    </span>
                  )}
                </div>

                {/* Certificate PDF */}
                <div className="certmgr-upload-group">
                  <label className="certmgr-upload-label">Certificate Document</label>
                  {formData.certificate_pdf_url ? (
                    <div className="certmgr-current-file">
                      <div className="certmgr-file-preview">
                        <div className="certmgr-file-info">
                          <span className="certmgr-file-icon">📄</span>
                          <span className="certmgr-file-text">Certificate uploaded</span>
                        </div>
                        <div className="certmgr-file-actions">
                          <a 
                            href={formData.certificate_pdf_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="certmgr-view-file-btn"
                            title="View certificate"
                          >
                            👁️ View
                          </a>
                          <button
                            type="button"
                            onClick={removeCertificatePdf}
                            className="certmgr-remove-file-btn"
                            title="Remove certificate"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="certmgr-upload-section">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => e.target.files[0] && handleCertificatePdfUpload(e.target.files[0])}
                        disabled={certificatePdfUploading}
                        className="certmgr-file-input"
                        id="certmgr-certificate-pdf-upload"
                      />
                      <label htmlFor="certmgr-certificate-pdf-upload" className="certmgr-upload-btn">
                        {certificatePdfUploading ? (
                          <>
                            <LoadingSpinner size="small" />
                            Uploading... {Math.round(uploadProgress)}%
                          </>
                        ) : (
                          <>
                            <span className="certmgr-btn-icon">📄</span>
                            Upload Certificate
                          </>
                        )}
                      </label>
                      <p className="certmgr-upload-help">
                        Upload certificate (PDF, JPEG, PNG, max 10MB)
                      </p>
                    </div>
                  )}
                  {validationErrors.certificate_pdf && (
                    <span className="certmgr-error-text" role="alert">
                      {validationErrors.certificate_pdf}
                    </span>
                  )}
                </div>
              </div>

              {/* Additional Details Section */}
              <div className="certmgr-form-section-group">
                <h4 className="certmgr-section-title">
                  <span className="certmgr-section-icon">🔧</span>
                  Additional Details
                </h4>
                
                <div className="certmgr-form-row">
                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-certification-type" className="certmgr-form-label">
                        Certification Type
                      </label>
                      <span className="certmgr-char-count">
                        {characterCounts.certification_type}/50
                      </span>
                    </div>
                    <select
                      id="certmgr-certification-type"
                      value={formData.certification_type}
                      onChange={(e) => handleInputChange('certification_type', e.target.value)}
                      className="certmgr-form-select"
                    >
                      <option value="">Select Type</option>
                      {certificationTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-difficulty-level" className="certmgr-form-label">
                        Difficulty Level
                      </label>
                      <span className="certmgr-char-count">
                        {characterCounts.difficulty_level}/50
                      </span>
                    </div>
                    <select
                      id="certmgr-difficulty-level"
                      value={formData.difficulty_level}
                      onChange={(e) => handleInputChange('difficulty_level', e.target.value)}
                      className="certmgr-form-select"
                    >
                      <option value="">Select Level</option>
                      {difficultyLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              <div className="certmgr-form-section-group">
                <h4 className="certmgr-section-title">
                  <span className="certmgr-section-icon">⚙️</span>
                  Certification Settings
                </h4>
                
                <div className="certmgr-form-row">
                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-verification-status" className="certmgr-form-label">
                        Verification Status
                      </label>
                    </div>
                    <select
                      id="certmgr-verification-status"
                      value={formData.verification_status}
                      onChange={(e) => handleInputChange('verification_status', e.target.value)}
                      className="certmgr-form-select"
                    >
                      <option value="verified">Verified</option>
                      <option value="pending">Pending</option>
                      <option value="unverified">Unverified</option>
                    </select>
                  </div>

                  <div className="certmgr-form-group">
                    <div className="certmgr-form-label-wrapper">
                      <label htmlFor="certmgr-order-index" className="certmgr-form-label">
                        Display Order
                      </label>
                    </div>
                    <input
                      id="certmgr-order-index"
                      type="number"
                      value={formData.order_index || ''}
                      onChange={(e) => handleInputChange('order_index', e.target.value ? parseInt(e.target.value) : null)}
                      className="certmgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                    <p className="certmgr-form-help">
                      Lower numbers appear first (leave empty for default ordering)
                    </p>
                  </div>
                </div>

                <div className="certmgr-form-group">
                  <div className="certmgr-checkbox-wrapper">
                    <input
                      id="certmgr-is-featured"
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => handleInputChange('is_featured', e.target.checked)}
                      className="certmgr-form-checkbox"
                    />
                    <label htmlFor="certmgr-is-featured" className="certmgr-checkbox-label">
                      Mark as Featured Certification
                    </label>
                  </div>
                  <p className="certmgr-form-help">
                    Featured certifications appear prominently on your portfolio
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
          <div className="certmgr-preview-section">
            <div className="certmgr-preview-container certmgr-glass-card">
              <h3 className="certmgr-preview-title">
                <span className="certmgr-preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="certmgr-certification-preview">
                <div className="certmgr-preview-certification-card">
                  
                  {/* Preview Header */}
                  <div className="certmgr-preview-card-header">
                    <div className="certmgr-preview-status-indicators">
                      {formData.is_featured && (
                        <div className="certmgr-preview-featured-badge">
                          <span className="certmgr-badge-text">FEATURED</span>
                        </div>
                      )}
                      <div className="certmgr-preview-status-badge">
                        <span className="certmgr-badge-text">{formData.status.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="certmgr-preview-title-section">
                    <h3 className="certmgr-preview-certification-title">
                      {formData.title || 'Certification Title'}
                    </h3>
                    <div className="certmgr-preview-title-underline"></div>
                  </div>

                  {/* Preview Issuer */}
                  <div className="certmgr-preview-issuer-section">
                    <span className="certmgr-preview-issuer-label">Issued by</span>
                    <span className="certmgr-preview-issuer-name">{formData.issuer || 'Issuing Organization'}</span>
                  </div>

                  {/* Preview Meta Information */}
                  <div className="certmgr-preview-meta-section">
                    <div className="certmgr-preview-meta-row">
                      <div className="certmgr-preview-meta-item">
                        <span className="certmgr-meta-label">Issue Date</span>
                        <span className="certmgr-meta-value">
                          {formData.issue_date ? formatCertificationDate(formData.issue_date) : 'N/A'}
                        </span>
                      </div>
                      <div className="certmgr-preview-meta-item">
                        <span className="certmgr-meta-label">Expiry</span>
                        <span className="certmgr-meta-value">
                          {formData.expiry_date ? getExpiryStatus(formData.expiry_date) : 'No Expiry'}
                        </span>
                      </div>
                    </div>
                    
                    {formData.credential_id && (
                      <div className="certmgr-preview-meta-row">
                        <div className="certmgr-preview-meta-item">
                          <span className="certmgr-meta-label">Credential ID</span>
                          <span className="certmgr-meta-value">{formData.credential_id}</span>
                        </div>
                      </div>
                    )}

                    <div className="certmgr-preview-meta-row">
                      {formData.certification_type && (
                        <div className="certmgr-preview-meta-item">
                          <span className="certmgr-meta-label">Type</span>
                          <span className="certmgr-meta-value">{formData.certification_type}</span>
                        </div>
                      )}
                      {formData.difficulty_level && (
                        <div className="certmgr-preview-meta-item">
                          <span className="certmgr-meta-label">Level</span>
                          <span className="certmgr-meta-value">{formData.difficulty_level}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview Description */}
                  {formData.description && (
                    <div className="certmgr-preview-description-section">
                      <h4 className="certmgr-preview-section-title">Description</h4>
                      <p className="certmgr-preview-description-text">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Preview Skills */}
                  {formData.skills_covered.length > 0 && (
                    <div className="certmgr-preview-skills-section">
                      <h4 className="certmgr-preview-section-title">Skills Covered</h4>
                      <div className="certmgr-preview-skills-list">
                        {formData.skills_covered.map((skill, index) => (
                          <span key={index} className="certmgr-preview-skill-tag">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview Actions */}
                  <div className="certmgr-preview-actions-section">
                    {formData.credential_url && (
                      <div className="certmgr-preview-action-item">
                        <span className="certmgr-action-icon">🔗</span>
                        <span className="certmgr-action-text">Verify Credential</span>
                      </div>
                    )}
                    {formData.certificate_pdf_url && (
                      <div className="certmgr-preview-action-item">
                        <span className="certmgr-action-icon">📄</span>
                        <span className="certmgr-action-text">View Certificate</span>
                      </div>
                    )}
                    {formData.badge_image_url && (
                      <div className="certmgr-preview-action-item">
                        <span className="certmgr-action-icon">🎖️</span>
                        <span className="certmgr-action-text">Badge Available</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Status */}
              <div className="certmgr-preview-status">
                <span className={`certmgr-status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                <span className="certmgr-featured-status-indicator">
                  {formData.is_featured ? '⭐ Featured Certification' : '📋 Regular Certification'}
                </span>
                <span className="certmgr-verification-indicator">
                  {formData.verification_status === 'verified' && '✅ Verified'}
                  {formData.verification_status === 'pending' && '⏳ Pending Verification'}
                  {formData.verification_status === 'unverified' && '❌ Unverified'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CertificationsManager;