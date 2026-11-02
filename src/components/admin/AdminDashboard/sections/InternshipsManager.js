// src/components/admin/AdminDashboard/sections/InternshipsManager.js - Part 1

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './InternshipsManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const InternshipsManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: internshipsData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('internships', {}, { 
    orderBy: [
      { column: 'order_index', ascending: true },
      { column: 'start_date', ascending: false }
    ],
    cacheKey: 'internships-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedInternship, setSelectedInternship] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    internship_number: '',
    title: '',
    company: '',
    company_logo_url: '',
    start_date: '',
    end_date: '',
    duration: '',
    location: '',
    description: '',
    key_responsibilities: [],
    technologies: [],
    achievements: [],
    skills_gained: [],
    internship_type: '',
    order_index: null,
    status: 'active',
    certificate_urls: []
  });

  // UI state management
  const [uiState, setUiState] = useState({
    isSaving: false,
    hasChanges: false,
    showPreview: false,
    saveStatus: null, // 'success', 'error', null
    isPostSave: false
  });

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});
  
  // Dynamic arrays management
  const [newTechnology, setNewTechnology] = useState('');
  const [newResponsibility, setNewResponsibility] = useState('');
  const [newAchievement, setNewAchievement] = useState('');
  const [newSkill, setNewSkill] = useState('');

  // File upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [certificatesUploading, setCertificatesUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [internshipToDelete, setInternshipToDelete] = useState(null);

  // FIXED: Added specific modals for logo and certificate deletion
  const [showLogoDeleteModal, setShowLogoDeleteModal] = useState(false);
  const [showCertDeleteModal, setShowCertDeleteModal] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState(null);

  // Technology suggestions for autocomplete
  const technologySuggestions = [
    'Python', 'R', 'SQL', 'JavaScript', 'Java', 'C++', 'MATLAB', 'Tableau',
    'Power BI', 'Excel', 'Google Analytics', 'TensorFlow', 'PyTorch', 'Pandas',
    'NumPy', 'Scikit-learn', 'Jupyter', 'Git', 'Docker', 'AWS', 'Azure',
    'Google Cloud', 'MongoDB', 'PostgreSQL', 'MySQL', 'Apache Spark', 'Hadoop'
  ];

  // Internship type options
  const internshipTypeOptions = [
    'Remote', 'On-site', 'Hybrid', 'Part-time', 'Full-time', 'Paid', 'Unpaid',
    'Academic Credit', 'Summer Internship', 'Winter Internship', 'Co-op'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    company: formData.company.length,
    description: formData.description.length,
    duration: formData.duration.length,
    location: formData.location.length,
    responsibilitiesCount: formData.key_responsibilities.length,
    technologiesCount: formData.technologies.length,
    achievementsCount: formData.achievements.length,
    skillsCount: formData.skills_gained.length,
    certificatesCount: formData.certificate_urls.length
  }), [formData]);

  const filteredInternships = useMemo(() => {
    if (!internshipsData) return [];
    
    return internshipsData.filter(internship => {
      const matchesSearch = internship.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           internship.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           internship.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || internship.status === filterStatus;
      const matchesType = filterType === 'all' || internship.internship_type === filterType;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [internshipsData, searchTerm, filterStatus, filterType]);

  const internshipTypes = useMemo(() => {
    if (!internshipsData) return [];
    const types = [...new Set(internshipsData.map(i => i.internship_type).filter(Boolean))];
    return types.sort();
  }, [internshipsData]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedInternship && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.title.trim() !== '' || 
             formData.company.trim() !== '' ||
             formData.description.trim() !== '' ||
             formData.key_responsibilities.length > 0 ||
             formData.technologies.length > 0 ||
             formData.achievements.length > 0 ||
             formData.skills_gained.length > 0;
    }

    if (viewMode === 'edit' && selectedInternship) {
      return (
        formData.title !== (selectedInternship.title || '') ||
        formData.company !== (selectedInternship.company || '') ||
        formData.description !== (selectedInternship.description || '') ||
        formData.start_date !== (selectedInternship.start_date || '') ||
        formData.end_date !== (selectedInternship.end_date || '') ||
        formData.duration !== (selectedInternship.duration || '') ||
        formData.location !== (selectedInternship.location || '') ||
        formData.internship_type !== (selectedInternship.internship_type || '') ||
        formData.status !== (selectedInternship.status || 'active') ||
        JSON.stringify(formData.key_responsibilities) !== JSON.stringify(selectedInternship.key_responsibilities || []) ||
        JSON.stringify(formData.technologies) !== JSON.stringify(selectedInternship.technologies || []) ||
        JSON.stringify(formData.achievements) !== JSON.stringify(selectedInternship.achievements || []) ||
        JSON.stringify(formData.skills_gained) !== JSON.stringify(selectedInternship.skills_gained || []) ||
        JSON.stringify(formData.certificate_urls) !== JSON.stringify(selectedInternship.certificate_urls || [])
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedInternship, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing internship
  useEffect(() => {
    if (viewMode === 'edit' && selectedInternship) {
      const newFormData = {
        internship_number: selectedInternship.internship_number || '',
        title: selectedInternship.title || '',
        company: selectedInternship.company || '',
        company_logo_url: selectedInternship.company_logo_url || '',
        start_date: selectedInternship.start_date || '',
        end_date: selectedInternship.end_date || '',
        duration: selectedInternship.duration || '',
        location: selectedInternship.location || '',
        description: selectedInternship.description || '',
        key_responsibilities: Array.isArray(selectedInternship.key_responsibilities) ? [...selectedInternship.key_responsibilities] : [],
        technologies: Array.isArray(selectedInternship.technologies) ? [...selectedInternship.technologies] : [],
        achievements: Array.isArray(selectedInternship.achievements) ? [...selectedInternship.achievements] : [],
        skills_gained: Array.isArray(selectedInternship.skills_gained) ? [...selectedInternship.skills_gained] : [],
        internship_type: selectedInternship.internship_type || '',
        order_index: selectedInternship.order_index,
        status: selectedInternship.status || 'active',
        certificate_urls: Array.isArray(selectedInternship.certificate_urls) ? [...selectedInternship.certificate_urls] : []
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
  }, [viewMode, selectedInternship]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        internship_number: '',
        title: '',
        company: '',
        company_logo_url: '',
        start_date: '',
        end_date: '',
        duration: '',
        location: '',
        description: '',
        key_responsibilities: [],
        technologies: [],
        achievements: [],
        skills_gained: [],
        internship_type: '',
        order_index: null,
        status: 'active',
        certificate_urls: []
      });
      setValidationErrors({});
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
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      return newData;
    });
    
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

  // ============================================================================
  // DYNAMIC ARRAYS MANAGEMENT - RESPONSIBILITIES, TECHNOLOGIES, ACHIEVEMENTS, SKILLS
  // ============================================================================
  
  const addResponsibility = useCallback(() => {
    const trimmedResp = newResponsibility.trim();
    
    if (trimmedResp && 
        trimmedResp.length <= 200 && 
        formData.key_responsibilities.length < 15 &&
        !formData.key_responsibilities.includes(trimmedResp)) {
      
      const updatedResponsibilities = [...formData.key_responsibilities, trimmedResp];
      handleInputChange('key_responsibilities', updatedResponsibilities);
      setNewResponsibility('');
    }
  }, [newResponsibility, formData.key_responsibilities, handleInputChange]);

  const removeResponsibility = useCallback((index) => {
    const updatedResponsibilities = formData.key_responsibilities.filter((_, i) => i !== index);
    handleInputChange('key_responsibilities', updatedResponsibilities);
  }, [formData.key_responsibilities, handleInputChange]);

  const addTechnology = useCallback(() => {
    const trimmedTech = newTechnology.trim();
    
    if (trimmedTech && 
        trimmedTech.length <= 50 && 
        formData.technologies.length < 20 &&
        !formData.technologies.includes(trimmedTech)) {
      
      const updatedTechnologies = [...formData.technologies, trimmedTech];
      handleInputChange('technologies', updatedTechnologies);
      setNewTechnology('');
    }
  }, [newTechnology, formData.technologies, handleInputChange]);

  const removeTechnology = useCallback((index) => {
    const updatedTechnologies = formData.technologies.filter((_, i) => i !== index);
    handleInputChange('technologies', updatedTechnologies);
  }, [formData.technologies, handleInputChange]);

  const addAchievement = useCallback(() => {
    const trimmedAchievement = newAchievement.trim();
    
    if (trimmedAchievement && 
        trimmedAchievement.length <= 200 && 
        formData.achievements.length < 10 &&
        !formData.achievements.includes(trimmedAchievement)) {
      
      const updatedAchievements = [...formData.achievements, trimmedAchievement];
      handleInputChange('achievements', updatedAchievements);
      setNewAchievement('');
    }
  }, [newAchievement, formData.achievements, handleInputChange]);

  const removeAchievement = useCallback((index) => {
    const updatedAchievements = formData.achievements.filter((_, i) => i !== index);
    handleInputChange('achievements', updatedAchievements);
  }, [formData.achievements, handleInputChange]);

  const addSkill = useCallback(() => {
    const trimmedSkill = newSkill.trim();
    
    if (trimmedSkill && 
        trimmedSkill.length <= 100 && 
        formData.skills_gained.length < 15 &&
        !formData.skills_gained.includes(trimmedSkill)) {
      
      const updatedSkills = [...formData.skills_gained, trimmedSkill];
      handleInputChange('skills_gained', updatedSkills);
      setNewSkill('');
    }
  }, [newSkill, formData.skills_gained, handleInputChange]);

  const removeSkill = useCallback((index) => {
    const updatedSkills = formData.skills_gained.filter((_, i) => i !== index);
    handleInputChange('skills_gained', updatedSkills);
  }, [formData.skills_gained, handleInputChange]);

  // Handle Enter key for adding items
  const handleKeyPress = useCallback((e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  }, []);

  // ============================================================================
  // FIXED: FILE UPLOAD HANDLING - COMPANY LOGO WITH STORAGE DELETION
  // ============================================================================
  
  const handleLogoUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        company_logo: 'File size must be less than 5MB'
      }));
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        company_logo: 'Only JPEG, PNG, and WebP files are allowed'
      }));
      return;
    }

    setLogoUploading(true);

    try {
      // Import Supabase client for file upload
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const fileName = `company-logo-${timestamp}.${fileExtension}`;
      const filePath = `internships/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('organization-logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('organization-logos')
        .getPublicUrl(filePath);

      handleInputChange('company_logo_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.company_logo;
        return newErrors;
      });

    } catch (error) {
      console.error('Logo upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        company_logo: error.message || 'Failed to upload logo'
      }));
    } finally {
      setLogoUploading(false);
    }
  }, [handleInputChange]);

  // FIXED: Logo removal with storage deletion
  const removeLogo = useCallback(() => {
    setShowLogoDeleteModal(true);
  }, []);

  const confirmLogoDelete = useCallback(async () => {
    if (!formData.company_logo_url) return;

    try {
      // Import Supabase client for file deletion
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = formData.company_logo_url.split('/storage/v1/object/public/organization-logos/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('organization-logos')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete logo file from storage:', storageError);
        }
      }

      // Remove logo URL from form
      handleInputChange('company_logo_url', '');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Company logo deleted successfully.'
      }));

    } catch (error) {
      console.error('Logo delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        company_logo: error.message || 'Failed to delete logo'
      }));
    } finally {
      setShowLogoDeleteModal(false);
    }
  }, [formData.company_logo_url, handleInputChange]);

  const cancelLogoDelete = useCallback(() => {
    setShowLogoDeleteModal(false);
  }, []);

  // ============================================================================
  // FIXED: CERTIFICATES UPLOAD WITH PROPER FILE TYPE VALIDATION
  // ============================================================================
  
  const handleCertificatesUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const maxSize = 10 * 1024 * 1024; // 10MB per file
    // FIXED: Expanded allowed types to include all common certificate formats
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 
      'image/jpg', 
      'image/png', 
      'image/webp',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const maxFiles = 5;

    // Validate files
    if (files.length > maxFiles) {
      setValidationErrors(prev => ({
        ...prev,
        certificates: `Maximum ${maxFiles} certificates allowed`
      }));
      return;
    }

    for (const file of files) {
      if (file.size > maxSize) {
        setValidationErrors(prev => ({
          ...prev,
          certificates: `File ${file.name} is too large. Maximum size is 10MB`
        }));
        return;
      }
      
      // FIXED: Better file type validation that checks both MIME type and extension
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const isValidMimeType = allowedTypes.includes(file.type);
      const isValidExtension = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx'].includes(fileExtension);
      
      if (!isValidMimeType && !isValidExtension) {
        setValidationErrors(prev => ({
          ...prev,
          certificates: `File ${file.name} has invalid type. Only PDF, JPEG, PNG, WebP, GIF, DOC, and DOCX files are allowed`
        }));
        return;
      }
    }

    setCertificatesUploading(true);
    setUploadProgress(0);

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const uploadPromises = Array.from(files).map(async (file, index) => {
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const internshipTitle = formData.title || 'internship';
        const sanitizedTitle = internshipTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `${sanitizedTitle}-certificate-${timestamp}-${index + 1}.${fileExtension}`;
        const filePath = `internships/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
          .from('documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`Upload failed for ${fileName}: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('documents')
          .getPublicUrl(filePath);

        // Update progress
        setUploadProgress(prev => prev + (100 / files.length));

        return urlData.publicUrl;
      });

      // Wait for all uploads to complete
      const uploadedUrls = await Promise.all(uploadPromises);
      
      // Add new URLs to existing ones
      const updatedCertificateUrls = [...formData.certificate_urls, ...uploadedUrls];
      handleInputChange('certificate_urls', updatedCertificateUrls);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.certificates;
        return newErrors;
      });

    } catch (error) {
      console.error('Certificate upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificates: error.message || 'Failed to upload certificates'
      }));
    } finally {
      setCertificatesUploading(false);
      setUploadProgress(0);
    }
  }, [formData.certificate_urls, formData.title, handleInputChange]);

  // FIXED: Individual certificate removal with storage deletion
  const removeCertificate = useCallback((index) => {
    const certificateUrl = formData.certificate_urls[index];
    setCertificateToDelete({ index, url: certificateUrl });
    setShowCertDeleteModal(true);
  }, [formData.certificate_urls]);

  const confirmCertificateDelete = useCallback(async () => {
    if (!certificateToDelete) return;

    try {
      // Import Supabase client for file deletion
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = certificateToDelete.url.split('/storage/v1/object/public/documents/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('documents')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete certificate file from storage:', storageError);
        }
      }

      // Remove certificate URL from form array
      const updatedCertificates = formData.certificate_urls.filter((_, i) => i !== certificateToDelete.index);
      handleInputChange('certificate_urls', updatedCertificates);
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Certificate deleted successfully.'
      }));

    } catch (error) {
      console.error('Certificate delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificates: error.message || 'Failed to delete certificate'
      }));
    } finally {
      setShowCertDeleteModal(false);
      setCertificateToDelete(null);
    }
  }, [certificateToDelete, formData.certificate_urls, handleInputChange]);

  const cancelCertificateDelete = useCallback(() => {
    setShowCertDeleteModal(false);
    setCertificateToDelete(null);
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Title validation (required, 5-100 chars)
    const titleTrimmed = formData.title.trim();
    if (!titleTrimmed) {
      errors.title = 'Internship title is required';
    } else if (titleTrimmed.length < 5) {
      errors.title = 'Internship title must be at least 5 characters';
    } else if (titleTrimmed.length > 100) {
      errors.title = 'Internship title must be less than 100 characters';
    }

    // Company validation (required, 2-100 chars)
    const companyTrimmed = formData.company.trim();
    if (!companyTrimmed) {
      errors.company = 'Company name is required';
    } else if (companyTrimmed.length < 2) {
      errors.company = 'Company name must be at least 2 characters';
    } else if (companyTrimmed.length > 100) {
      errors.company = 'Company name must be less than 100 characters';
    }

    // Description validation (optional, max 2000 chars)
    if (formData.description && formData.description.length > 2000) {
      errors.description = 'Description must be less than 2000 characters';
    }

    // Date validation
    if (formData.start_date && formData.end_date) {
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);
      if (endDate < startDate) {
        errors.end_date = 'End date must be after start date';
      }
    }

    // Duration validation (optional, max 50 chars)
    if (formData.duration && formData.duration.length > 50) {
      errors.duration = 'Duration must be less than 50 characters';
    }

    // Location validation (optional, max 100 chars)
    if (formData.location && formData.location.length > 100) {
      errors.location = 'Location must be less than 100 characters';
    }

    // Internship type validation (optional, max 50 chars)
    if (formData.internship_type && formData.internship_type.length > 50) {
      errors.internship_type = 'Internship type must be less than 50 characters';
    }

    // Array validations
    if (formData.key_responsibilities.length > 15) {
      errors.key_responsibilities = 'Maximum 15 responsibilities allowed';
    }

    if (formData.technologies.length > 20) {
      errors.technologies = 'Maximum 20 technologies allowed';
    }

    if (formData.achievements.length > 10) {
      errors.achievements = 'Maximum 10 achievements allowed';
    }

    if (formData.skills_gained.length > 15) {
      errors.skills_gained = 'Maximum 15 skills allowed';
    }

    if (formData.certificate_urls.length > 5) {
      errors.certificate_urls = 'Maximum 5 certificates allowed';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING PROJECTS MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Internship save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        internship_number: formData.internship_number || null,
        title: formData.title.trim(),
        company: formData.company.trim(),
        company_logo_url: formData.company_logo_url || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        duration: formData.duration.trim() || null,
        location: formData.location.trim() || null,
        description: formData.description.trim() || null,
        key_responsibilities: formData.key_responsibilities,
        technologies: formData.technologies,
        achievements: formData.achievements,
        skills_gained: formData.skills_gained,
        internship_type: formData.internship_type.trim() || null,
        order_index: formData.order_index,
        status: formData.status,
        certificate_urls: formData.certificate_urls
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
      
      if (viewMode === 'edit' && selectedInternship?.id) {
        // Update existing internship
        console.log('🔄 Updating existing internship with ID:', selectedInternship.id);
        const { data, error } = await supabaseAdmin
          .from('internships')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedInternship.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update internship: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new internship
        console.log('➕ Creating new internship');
        const { data, error } = await supabaseAdmin
          .from('internships')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create internship: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('internships');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new internship, switch to list view after save
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
        throw new Error(result?.error || result?.message || 'Failed to save internship');
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
  }, [formData, selectedInternship, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new internship? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedInternship(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((internship) => {
   if (hasUnsavedChanges && viewMode !== 'list' && selectedInternship?.id !== internship.id) {
     if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different internship? Changes will be lost.')) {
       return;
     }
   }
   setSelectedInternship(internship);
   setViewMode('edit');
 }, [hasUnsavedChanges, viewMode, selectedInternship]);

 const handleCancel = useCallback(() => {
   if (hasUnsavedChanges) {
     if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
       return;
     }
   }
   setViewMode('list');
   setSelectedInternship(null);
   setValidationErrors({});
   setNewTechnology('');
   setNewResponsibility('');
   setNewAchievement('');
   setNewSkill('');
   setUiState(prev => ({
     ...prev,
     hasChanges: false,
     saveStatus: null,
     isPostSave: false
   }));
 }, [hasUnsavedChanges]);

 const handleDelete = useCallback((internship) => {
   setInternshipToDelete(internship);
   setShowDeleteModal(true);
 }, []);

 const confirmDeleteAction = useCallback(async () => {
   if (!internshipToDelete) return;

   try {
     const { createClient } = await import('@supabase/supabase-js');
     const supabaseAdmin = createClient(
       process.env.REACT_APP_SUPABASE_URL,
       process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
     );

     const { error } = await supabaseAdmin
       .from('internships')
       .delete()
       .eq('id', internshipToDelete.id);

     if (error) {
       throw new Error(`Failed to delete internship: ${error.message}`);
     }

     triggerPublicRefresh('internships');
     setUiState(prev => ({ 
       ...prev, 
       saveStatus: 'success',
       statusMessageContent: `Internship "${internshipToDelete.title}" has been deleted.`
     }));
     refetch();

   } catch (error) {
     console.error('Delete error:', error);
     setUiState(prev => ({ 
       ...prev, 
       saveStatus: 'error',
       statusMessageContent: `Error deleting internship: ${error.message}`
     }));
   } finally {
     setShowDeleteModal(false);
     setInternshipToDelete(null);
   }
 }, [internshipToDelete, refetch]);

 const cancelDeleteAction = useCallback(() => {
   setShowDeleteModal(false);
   setInternshipToDelete(null);
 }, []);

 const togglePreview = useCallback(() => {
   setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
 }, []);

 // ============================================================================
 // FORMAT HELPER FUNCTIONS
 // ============================================================================
 
 const formatDate = useCallback((dateString) => {
   if (!dateString) return 'N/A';
   try {
     const date = new Date(dateString);
     return date.toLocaleDateString('en-US', { 
       year: 'numeric', 
       month: 'short',
       day: 'numeric'
     });
   } catch (error) {
     return dateString || 'N/A';
   }
 }, []);

 const calculateDuration = useCallback((startDate, endDate, duration) => {
   if (duration) return duration;
   
   if (!startDate || !endDate) return 'N/A';
   
   try {
     const start = new Date(startDate);
     const end = new Date(endDate);
     const diffTime = Math.abs(end - start);
     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
     const diffMonths = Math.round(diffDays / 30);
     
     if (diffMonths < 1) return `${diffDays} days`;
     if (diffMonths === 1) return '1 month';
     return `${diffMonths} months`;
   } catch (error) {
     return 'N/A';
   }
 }, []);

 // ============================================================================
 // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
 // ============================================================================
 
 if (dataLoading && !internshipsData) {
   return (
     <div className="internships-manager-loading">
       <LoadingSpinner size="large" />
       <p>Loading internships...</p>
     </div>
   );
 }

 // ============================================================================
 // RENDER - OPTIMIZED JSX STRUCTURE
 // ============================================================================
 
 return (
   <div className="internships-content-manager">
     {/* Header Section */}
     <div className="internships-manager-header">
       <div className="header-content">
         <h2 className="internships-manager-title">
          <span className="internships-title-icon">🏢</span>
           Internships Management
         </h2>
         <p className="manager-subtitle">
           Manage your internship experiences and professional learning opportunities
         </p>
       </div>

       <div className="header-actions">
         {viewMode === 'list' ? (
           <>
             <button
               className="action-btn add-btn primary"
               onClick={handleAddNew}
               title="Add New Internship"
               type="button"
             >
               <span className="btn-icon">➕</span>
               Add Internship
             </button>
           </>
         ) : (
           <>
             <button
               className="action-btn preview-btn"
               onClick={togglePreview}
               title="Toggle Preview"
               type="button"
             >
               <span className="btn-icon">👁️</span>
               {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
             </button>
             <div className="edit-actions">
               <button
                 className="action-btn cancel-btn"
                 onClick={handleCancel}
                 disabled={uiState.isSaving}
                 title="Cancel Changes"
                 type="button"
               >
                 <span className="btn-icon">❌</span>
                 Cancel
               </button>
               <button
                 className="action-btn save-btn primary"
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
                     <span className="btn-icon">💾</span>
                     Save Internship
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
       <div className={`status-message ${uiState.saveStatus}`} role="alert">
         {uiState.saveStatus === 'success' && (
           <>
             <span className="status-icon">✅</span>
             <div className="status-content">
               <strong>Success!</strong> 
               {uiState.statusMessageContent || 'Internship has been saved successfully and is now live on your portfolio.'}
             </div>
           </>
         )}
         {uiState.saveStatus === 'error' && (
           <>
             <span className="status-icon">❌</span>
             <div className="status-content">
               <strong>Error!</strong> 
               {uiState.statusMessageContent || 'Failed to save internship. Please check your connection and try again.'}
             </div>
           </>
         )}
       </div>
     )}

     {/* Data Error */}
     {dataError && (
       <div className="status-message error" role="alert">
         <span className="status-icon">⚠️</span>
         Error loading internships: {
           typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
         }
       </div>
     )}

     {/* Delete Confirmation Modal */}
     {showDeleteModal && internshipToDelete && (
       <div className="modal-overlay">
         <div className="modal-content glass-card">
           <h3 className="modal-title">
             <span className="modal-icon">🗑️</span> Confirm Deletion
           </h3>
           <p className="modal-text">
             Are you sure you want to delete the internship: <strong>"{internshipToDelete.title}" at {internshipToDelete.company}</strong>? 
             This action cannot be undone.
           </p>
           <div className="modal-actions">
             <button
               type="button"
               className="action-btn cancel-btn"
               onClick={cancelDeleteAction}
             >
               <span className="btn-icon">❌</span> Cancel
             </button>
             <button
               type="button"
               className="action-btn delete-btn-confirm primary"
               onClick={confirmDeleteAction}
             >
               <span className="btn-icon">🗑️</span> Delete Internship
             </button>
           </div>
         </div>
       </div>
     )}

     {/* FIXED: Logo Delete Confirmation Modal */}
     {showLogoDeleteModal && (
       <div className="modal-overlay">
         <div className="modal-content glass-card">
           <h3 className="modal-title">
             <span className="modal-icon">🏢</span> Confirm Logo Deletion
           </h3>
           <p className="modal-text">
             Are you sure you want to delete this company logo? This action cannot be undone.
           </p>
           <div className="modal-actions">
             <button
               type="button"
               className="action-btn cancel-btn"
               onClick={cancelLogoDelete}
             >
               <span className="btn-icon">❌</span> Cancel
             </button>
             <button
               type="button"
               className="action-btn delete-btn-confirm primary"
               onClick={confirmLogoDelete}
             >
               <span className="btn-icon">🗑️</span> Delete Logo
             </button>
           </div>
         </div>
       </div>
     )}

     {/* FIXED: Certificate Delete Confirmation Modal */}
     {showCertDeleteModal && certificateToDelete && (
       <div className="modal-overlay">
         <div className="modal-content glass-card">
           <h3 className="modal-title">
             <span className="modal-icon">📄</span> Confirm Certificate Deletion
           </h3>
           <p className="modal-text">
             Are you sure you want to delete this certificate? This action cannot be undone.
           </p>
           <div className="modal-actions">
             <button
               type="button"
               className="action-btn cancel-btn"
               onClick={cancelCertificateDelete}
             >
               <span className="btn-icon">❌</span> Cancel
             </button>
             <button
               type="button"
               className="action-btn delete-btn-confirm primary"
               onClick={confirmCertificateDelete}
             >
               <span className="btn-icon">🗑️</span> Delete Certificate
             </button>
           </div>
         </div>
       </div>
     )}

     {/* Main Content */}
     <div className={`internships-manager-content ${uiState.showPreview ? 'with-preview' : ''}`}>
       
       {/* LIST VIEW */}
       {viewMode === 'list' && (
         <div className="internships-list-section">
           <div className="list-container glass-card">
             
             {/* Search and Filters */}
             <div className="list-controls">
               <div className="search-section">
                 <div className="search-wrapper">
                   <span className="search-icon">🔍</span>
                   <input
                     type="text"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     placeholder="Search internships by title, company, or description..."
                     className="search-input"
                   />
                 </div>
               </div>
               
               <div className="filters-section">
                 <select
                   value={filterStatus}
                   onChange={(e) => setFilterStatus(e.target.value)}
                   className="filter-select"
                 >
                   <option value="all">All Status</option>
                   <option value="active">Active</option>
                   <option value="archived">Archived</option>
                   <option value="draft">Draft</option>
                 </select>
                 
                 <select
                   value={filterType}
                   onChange={(e) => setFilterType(e.target.value)}
                   className="filter-select"
                 >
                   <option value="all">All Types</option>
                   {internshipTypes.map(type => (
                     <option key={type} value={type}>{type}</option>
                   ))}
                 </select>
               </div>
             </div>

             {/* Internships Table */}
             <div className="internships-table-wrapper">
               {filteredInternships.length === 0 ? (
                 <div className="no-internships-message">
                   <div className="no-internships-icon">🏢</div>
                   <h3>No Internships Found</h3>
                   <p>
                     {internshipsData?.length === 0 
                       ? 'No internships have been created yet. Click "Add Internship" to get started.'
                       : 'No internships match your current filters. Try adjusting your search criteria.'
                     }
                   </p>
                 </div>
               ) : (
                 <table className="internships-table">
                   <thead>
                     <tr>
                       <th>Internship</th>
                       <th>Company</th>
                       <th>Duration</th>
                       <th>Technologies</th>
                       <th>Status</th>
                       <th>Certificates</th>
                       <th>Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {filteredInternships.map((internship, index) => (
                       <tr key={internship.id || index} className="internship-row">
                         <td className="internship-info">
                           <div className="internship-main">
                             <div className="internship-title-row">
                               <h4 className="internship-title">{internship.title}</h4>
                             </div>
                             <p className="internship-description">
                               {internship.description || 'No description available'}
                             </p>
                             <div className="internship-meta">
                               {internship.internship_type && (
                                 <span className="meta-item">🏷️ {internship.internship_type}</span>
                               )}
                               {internship.location && (
                                 <span className="meta-item">📍 {internship.location}</span>
                               )}
                             </div>
                           </div>
                         </td>
                         
                         <td className="internship-company">
                           <div className="company-info">
                             <span className="company-name">{internship.company}</span>
                             {internship.company_logo_url && (
                               <img 
                                 src={internship.company_logo_url} 
                                 alt={`${internship.company} logo`}
                                 className="company-logo-mini"
                                 onError={(e) => {
                                   e.target.style.display = 'none';
                                 }}
                               />
                             )}
                           </div>
                         </td>
                         
                         <td className="internship-duration">
                           <div className="duration-info">
                             <span className="duration-text">
                               {calculateDuration(internship.start_date, internship.end_date, internship.duration)}
                             </span>
                             <div className="date-range">
                               {formatDate(internship.start_date)} - {formatDate(internship.end_date)}
                             </div>
                           </div>
                         </td>
                         
                         <td className="internship-technologies">
                           <div className="tech-tags-list">
                             {(internship.technologies || []).slice(0, 3).map((tech, i) => (
                               <span key={i} className="tech-tag-mini">{tech}</span>
                             ))}
                             {(internship.technologies || []).length > 3 && (
                               <span className="tech-more">+{(internship.technologies || []).length - 3}</span>
                             )}
                           </div>
                         </td>
                         
                         <td className="internship-status">
                           <span className={`status-badge ${internship.status || 'active'}`}>
                             {internship.status || 'active'}
                           </span>
                         </td>
                         
                         <td className="internship-certificates">
                           <div className="certificates-info">
                             <span className="certificates-count">
                               {(internship.certificate_urls || []).length}
                             </span>
                             {(internship.certificate_urls || []).length > 0 && (
                               <span className="certificates-icon">📜</span>
                             )}
                           </div>
                         </td>
                         
                         <td className="internship-actions">
                           <div className="action-buttons">
                             <button
                               className="action-btn-mini edit-btn"
                               onClick={() => handleEdit(internship)}
                               title="Edit Internship"
                             >
                               ✏️
                             </button>
                             <button
                               className="action-btn-mini delete-btn"
                               onClick={() => handleDelete(internship)}
                               title="Delete Internship"
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
             
             {/* Internships Summary */}
             {internshipsData && internshipsData.length > 0 && (
               <div className="internships-summary">
                 <div className="summary-stats">
                   <span className="stat-item">
                     <strong>{internshipsData.length}</strong> total internships
                   </span>
                   <span className="stat-item">
                     <strong>{internshipsData.filter(i => i.status === 'active').length}</strong> active
                   </span>
                   <span className="stat-item">
                     <strong>{internshipsData.filter(i => (i.certificate_urls || []).length > 0).length}</strong> with certificates
                   </span>
                 </div>
               </div>
             )}
           </div>
         </div>
       )}

       {/* FORM VIEW (ADD/EDIT) */}
       {(viewMode === 'add' || viewMode === 'edit') && (
         <div className="form-section">
           <div className="form-container glass-card">
             
             {/* Form Title */}
             <div className="form-title-section">
               <h3 className="form-title">
                 {viewMode === 'add' ? 'Add New Internship' : `Edit: ${selectedInternship?.title}`}
               </h3>
               <p className="form-subtitle">
                 {viewMode === 'add' 
                   ? 'Create a new internship entry for your portfolio'
                   : 'Update internship information and details'
                 }
               </p>
             </div>

             {/* Basic Information Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">📋</span>
                 Basic Information
               </h4>
               
               <div className="form-row">
                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="internship-title" className="form-label required">
                       Internship Title
                     </label>
                     <span className="char-count">
                       {characterCounts.title}/100
                     </span>
                   </div>
                   <input
                     id="internship-title"
                     type="text"
                     value={formData.title}
                     onChange={(e) => handleInputChange('title', e.target.value)}
                     className={`form-input ${validationErrors.title ? 'error' : ''}`}
                     placeholder="Enter internship title..."
                     maxLength={100}
                     aria-describedby={validationErrors.title ? 'title-error' : undefined}
                   />
                   {validationErrors.title && (
                     <span id="title-error" className="error-text" role="alert">
                       {validationErrors.title}
                     </span>
                   )}
                 </div>

                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="company-name" className="form-label required">
                       Company Name
                     </label>
                     <span className="char-count">
                       {characterCounts.company}/100
                     </span>
                   </div>
                   <input
                     id="company-name"
                     type="text"
                     value={formData.company}
                     onChange={(e) => handleInputChange('company', e.target.value)}
                     className={`form-input ${validationErrors.company ? 'error' : ''}`}
                     placeholder="Enter company name..."
                     maxLength={100}
                   />
                   {validationErrors.company && (
                     <span className="error-text" role="alert">
                       {validationErrors.company}
                     </span>
                   )}
                 </div>
               </div>

               <div className="form-group">
                 <div className="form-label-wrapper">
                   <label htmlFor="description" className="form-label">
                     Description
                   </label>
                   <span className="char-count">
                     {characterCounts.description}/2000
                   </span>
                 </div>
                 <textarea
                   id="description"
                   value={formData.description}
                   onChange={(e) => handleInputChange('description', e.target.value)}
                   className={`form-textarea ${validationErrors.description ? 'error' : ''}`}
                   placeholder="Describe your internship experience, roles, and responsibilities..."
                   rows={4}
                   maxLength={2000}
                 />
                 {validationErrors.description && (
                   <span className="error-text" role="alert">
                     {validationErrors.description}
                   </span>
                 )}
               </div>

               <div className="form-row">
                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="internship-type" className="form-label">
                       Internship Type
                     </label>
                   </div>
                   <select
                     id="internship-type"
                     value={formData.internship_type}
                     onChange={(e) => handleInputChange('internship_type', e.target.value)}
                     className="form-select"
                   >
                     <option value="">Select type...</option>
                     {internshipTypeOptions.map(type => (
                       <option key={type} value={type}>{type}</option>
                     ))}
                   </select>
                 </div>

                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="location" className="form-label">
                       Location
                     </label>
                     <span className="char-count">
                       {characterCounts.location}/100
                     </span>
                   </div>
                   <input
                     id="location"
                     type="text"
                     value={formData.location}
                     onChange={(e) => handleInputChange('location', e.target.value)}
                     className="form-input"
                     placeholder="e.g., Remote, New York, NY"
                     maxLength={100}
                   />
                 </div>
               </div>
             </div>

             {/* Duration & Dates Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">📅</span>
                 Duration & Timeline
               </h4>
               
               <div className="form-row">
                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="start-date" className="form-label">
                       Start Date
                     </label>
                   </div>
                   <input
                     id="start-date"
                     type="date"
                     value={formData.start_date}
                     onChange={(e) => handleInputChange('start_date', e.target.value)}
                     className="form-input"
                   />
                 </div>

                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="end-date" className="form-label">
                       End Date
                     </label>
                   </div>
                   <input
                     id="end-date"
                     type="date"
                     value={formData.end_date}
                     onChange={(e) => handleInputChange('end_date', e.target.value)}
                     className={`form-input ${validationErrors.end_date ? 'error' : ''}`}
                   />
                   {validationErrors.end_date && (
                     <span className="error-text" role="alert">
                       {validationErrors.end_date}
                     </span>
                   )}
                 </div>
               </div>

               <div className="form-group">
                 <div className="form-label-wrapper">
                   <label htmlFor="duration" className="form-label">
                     Duration (Optional)
                   </label>
                   <span className="char-count">
                     {characterCounts.duration}/50
                   </span>
                 </div>
                 <input
                   id="duration"
                   type="text"
                   value={formData.duration}
                   onChange={(e) => handleInputChange('duration', e.target.value)}
                   className="form-input"
                   placeholder="e.g., 3 months, 12 weeks (auto-calculated if dates provided)"
                   maxLength={50}
                 />
                 {formData.start_date && formData.end_date && !formData.duration && (
                   <div className="auto-calculated">
                     Auto-calculated: {calculateDuration(formData.start_date, formData.end_date, null)}
                   </div>
                 )}
               </div>
             </div>

             {/* Company Logo Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">🏢</span>
                 Company Logo
               </h4>
               
               <div className="logo-upload-section">
                 {formData.company_logo_url && (
                   <div className="current-logo">
                     <img 
                       src={formData.company_logo_url} 
                       alt="Company logo"
                       className="logo-preview"
                       onError={(e) => {
                         e.target.style.display = 'none';
                       }}
                     />
                     <button
                       type="button"
                       onClick={removeLogo}
                       className="remove-logo-btn"
                       title="Remove logo"
                     >
                       ❌
                     </button>
                   </div>
                 )}
                 
                 <div className="upload-section">
                   <input
                     type="file"
                     accept="image/*"
                     onChange={(e) => e.target.files[0] && handleLogoUpload(e.target.files[0])}
                     disabled={logoUploading}
                     className="file-input"
                     id="logo-upload"
                   />
                   <label htmlFor="logo-upload" className="upload-btn">
                     {logoUploading ? (
                       <>
                         <LoadingSpinner size="small" />
                         Uploading...
                       </>
                     ) : (
                       <>
                         <span className="btn-icon">🏢</span>
                         Upload Company Logo
                       </>
                     )}
                   </label>
                   <p className="upload-help">
                     Upload company logo (JPEG, PNG, WebP, max 5MB)
                   </p>
                 </div>

                 {validationErrors.company_logo && (
                   <span className="error-text" role="alert">
                     {validationErrors.company_logo}
                   </span>
                 )}
               </div>
             </div>

             {/* Key Responsibilities Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">📋</span>
                 Key Responsibilities ({characterCounts.responsibilitiesCount}/15)
               </h4>
               
               <div className="responsibilities-list">
                 {formData.key_responsibilities.map((responsibility, index) => (
                   <div key={index} className="responsibility-item">
                     <span className="responsibility-text">{responsibility}</span>
                     <button
                       type="button"
                       onClick={() => removeResponsibility(index)}
                       className="remove-responsibility-btn"
                       title="Remove responsibility"
                     >
                       ❌
                     </button>
                   </div>
                 ))}
               </div>

               {formData.key_responsibilities.length < 15 && (
                 <div className="add-responsibility">
                   <textarea
                     value={newResponsibility}
                     onChange={(e) => setNewResponsibility(e.target.value)}
                     placeholder="Add key responsibility..."
                     className="form-textarea"
                     rows={2}
                     maxLength={200}
                     onKeyPress={(e) => handleKeyPress(e, addResponsibility)}
                   />
                   <button
                     type="button"
                     onClick={addResponsibility}
                     disabled={!newResponsibility.trim()}
                     className="add-responsibility-btn"
                   >
                     ➕ Add Responsibility
                   </button>
                 </div>
               )}

               {validationErrors.key_responsibilities && (
                 <span className="error-text" role="alert">
                   {validationErrors.key_responsibilities}
                 </span>
               )}
             </div>

             {/* Technologies Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">🛠️</span>
                 Technologies & Tools ({characterCounts.technologiesCount}/20)
               </h4>
               
               <div className="technologies-list">
                 {formData.technologies.map((tech, index) => (
                   <div key={index} className="technology-item">
                     <span className="tech-name">{tech}</span>
                     <button
                       type="button"
                       onClick={() => removeTechnology(index)}
                       className="remove-tech-btn"
                       title="Remove technology"
                     >
                       ❌
                     </button>
                   </div>
                 ))}
               </div>

               {formData.technologies.length < 20 && (
                 <div className="add-technology">
                   <input
                     type="text"
                     value={newTechnology}
                     onChange={(e) => setNewTechnology(e.target.value)}
                     placeholder="Add technology (e.g., Python, SQL, Tableau)..."
                     className="form-input"
                     maxLength={50}
                     onKeyPress={(e) => handleKeyPress(e, addTechnology)}
                     list="tech-suggestions"
                   />
                   <datalist id="tech-suggestions">
                     {technologySuggestions.map((suggestion, index) => (
                       <option key={index} value={suggestion} />
                     ))}
                   </datalist>
                   <button
                     type="button"
                     onClick={addTechnology}
                     disabled={!newTechnology.trim()}
                     className="add-tech-btn"
                   >
                     ➕ Add Technology
                   </button>
                 </div>
               )}

               {validationErrors.technologies && (
                 <span className="error-text" role="alert">
                   {validationErrors.technologies}
                 </span>
               )}
             </div>

             {/* Achievements Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">🏆</span>
                 Key Achievements ({characterCounts.achievementsCount}/10)
               </h4>
               
               <div className="achievements-list">
                 {formData.achievements.map((achievement, index) => (
                   <div key={index} className="achievement-item">
                     <span className="achievement-text">{achievement}</span>
                     <button
                       type="button"
                       onClick={() => removeAchievement(index)}
                       className="remove-achievement-btn"
                       title="Remove achievement"
                     >
                       ❌
                     </button>
                   </div>
                 ))}
               </div>

               {formData.achievements.length < 10 && (
                 <div className="add-achievement">
                   <textarea
                     value={newAchievement}
                     onChange={(e) => setNewAchievement(e.target.value)}
                     placeholder="Add key achievement..."
                     className="form-textarea"
                     rows={2}
                     maxLength={200}
                     onKeyPress={(e) => handleKeyPress(e, addAchievement)}
                   />
                   <button
                     type="button"
                     onClick={addAchievement}
                     disabled={!newAchievement.trim()}
                     className="add-achievement-btn"
                   >
                     ➕ Add Achievement
                   </button>
                 </div>
               )}

               {validationErrors.achievements && (
                 <span className="error-text" role="alert">
                   {validationErrors.achievements}
                 </span>
               )}
             </div>

             {/* Skills Gained Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">🧠</span>
                 Skills Gained ({characterCounts.skillsCount}/15)
               </h4>
               
               <div className="skills-list">
                 {formData.skills_gained.map((skill, index) => (
                   <div key={index} className="skill-item">
                     <span className="skill-name">{skill}</span>
                     <button
                       type="button"
                       onClick={() => removeSkill(index)}
                       className="remove-skill-btn"
                       title="Remove skill"
                     >
                       ❌
                     </button>
                   </div>
                 ))}
               </div>

               {formData.skills_gained.length < 15 && (
                 <div className="add-skill">
                   <input
                     type="text"
                     value={newSkill}
                     onChange={(e) => setNewSkill(e.target.value)}
                     placeholder="Add skill gained (e.g., Data Analysis, Project Management)..."
                     className="form-input"
                     maxLength={100}
                     onKeyPress={(e) => handleKeyPress(e, addSkill)}
                   />
                   <button
                     type="button"
                     onClick={addSkill}
                     disabled={!newSkill.trim()}
                     className="add-skill-btn"
                   >
                     ➕ Add Skill
                   </button>
                 </div>
               )}

               {validationErrors.skills_gained && (
                 <span className="error-text" role="alert">
                   {validationErrors.skills_gained}
                 </span>
               )}
             </div>

             {/* Certificates Section - Fixed Layout like CertificationsManager */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">📜</span>
                 Internship Certificates ({characterCounts.certificatesCount}/5)
               </h4>
               
               {formData.certificate_urls.map((url, index) => (
                 <div key={index} className="cert-upload-group">
                   <label className="cert-upload-label">Certificate {index + 1}</label>
                   <div className="current-file">
                     <div className="file-preview">
                       <div className="file-info">
                         <span className="file-icon">📄</span>
                         <span className="file-text">Certificate uploaded</span>
                       </div>
                       <div className="file-actions">
                         <a 
                           href={url} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="view-file-btn"
                           title="View certificate"
                         >
                           👁️ View
                         </a>
                         <button
                           type="button"
                           onClick={() => removeCertificate(index)}
                           className="remove-file-btn"
                           title="Remove certificate"
                         >
                           🗑️ Delete
                         </button>
                       </div>
                     </div>
                   </div>
                 </div>
               ))}

               {formData.certificate_urls.length < 5 && (
                 <div className="cert-upload-group">
                   <label className="cert-upload-label">Upload New Certificate</label>
                   <div className="upload-section">
                     <input
                       type="file"
                       accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx"
                       multiple
                       onChange={(e) => e.target.files.length > 0 && handleCertificatesUpload(e.target.files)}
                       disabled={certificatesUploading}
                       className="file-input"
                       id="certificates-upload"
                     />
                     <label htmlFor="certificates-upload" className="upload-btn">
                       {certificatesUploading ? (
                         <>
                           <LoadingSpinner size="small" />
                           Uploading... {Math.round(uploadProgress)}%
                         </>
                       ) : (
                         <>
                           <span className="btn-icon">📜</span>
                           Upload Certificates
                         </>
                       )}
                     </label>
                     <p className="upload-help">
                       Upload certificates (PDF, JPEG, PNG, WebP, GIF, DOC, DOCX, max 10MB each)
                     </p>
                   </div>
                 </div>
               )}

               {validationErrors.certificates && (
                 <span className="error-text" role="alert">
                   {validationErrors.certificates}
                 </span>
               )}
             </div>

             {/* Internship Settings Section */}
             <div className="form-section-group">
               <h4 className="section-title">
                 <span className="section-icon">⚙️</span>
                 Internship Settings
               </h4>
               
               <div className="form-row">
                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="status" className="form-label">
                       Status
                     </label>
                   </div>
                   <select
                     id="status"
                     value={formData.status}
                     onChange={(e) => handleInputChange('status', e.target.value)}
                     className="form-select"
                   >
                     <option value="active">Active</option>
                     <option value="draft">Draft</option>
                     <option value="archived">Archived</option>
                   </select>
                 </div>

                 <div className="form-group">
                   <div className="form-label-wrapper">
                     <label htmlFor="order-index" className="form-label">
                       Display Order
                     </label>
                   </div>
                   <input
                     id="order-index"
                     type="number"
                     min="0"
                     max="999"
                     value={formData.order_index || ''}
                     onChange={(e) => handleInputChange('order_index', parseInt(e.target.value) || null)}
                     className="form-input"
                     placeholder="Optional display order"
                   />
                 </div>
               </div>
             </div>
           </div>
         </div>
       )}

       {/* Preview Section */}
       {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
         <div className="preview-section">
           <div className="preview-container glass-card">
             <h3 className="preview-title">
               <span className="preview-icon">👁️</span>
               Live Preview
             </h3>
             
             <div className="internship-preview">
               <div className="preview-internship-card">
                 
                 {/* Preview Header */}
                 <div className="preview-card-header">
                   <div className="preview-company-logo">
                     {formData.company_logo_url ? (
                       <img 
                         src={formData.company_logo_url} 
                         alt="Company logo"
                         className="company-logo-preview"
                         onError={(e) => {
                           e.target.style.display = 'none';
                         }}
                       />
                     ) : (
                       <div className="company-logo-placeholder">
                         {formData.company ? formData.company.substring(0, 2).toUpperCase() : 'CO'}
                       </div>
                     )}
                   </div>

                   <div className="preview-status-indicators">
                     {formData.certificate_urls.length > 0 && (
                       <div className="preview-status-badge certificates">
                         <span className="badge-icon">📜</span>
                         <span className="badge-text">{formData.certificate_urls.length}</span>
                       </div>
                     )}
                   </div>
                 </div>

                 {/* Preview Title */}
                 <div className="preview-title-section">
                   <h3 className="preview-internship-title">
                     {formData.title || 'Internship Title'}
                   </h3>
                   <div className="preview-title-underline"></div>
                 </div>

                 {/* Preview Company */}
                 <div className="preview-company-section">
                   <h4 className="preview-company-name">
                     {formData.company || 'Company Name'}
                   </h4>
                 </div>

                 {/* Preview Description */}
                 <div className="preview-description-section">
                   <p className="preview-description-text">
                     {formData.description || 'No description available'}
                   </p>
                 </div>

                 {/* Preview Meta Information */}
                 <div className="preview-meta-section">
                   <div className="preview-meta-row">
                     <div className="preview-meta-item">
                       <span className="meta-label">Status</span>
                       <span className="meta-value">{formData.status}</span>
                     </div>
                     <div className="preview-meta-item">
                       <span className="meta-label">Type</span>
                       <span className="meta-value">{formData.internship_type || 'N/A'}</span>
                     </div>
                   </div>
                   <div className="preview-meta-row">
                     <div className="preview-meta-item">
                       <span className="meta-label">Start Date</span>
                       <span className="meta-value">{formatDate(formData.start_date)}</span>
                     </div>
                     <div className="preview-meta-item">
                       <span className="meta-label">End Date</span>
                       <span className="meta-value">{formatDate(formData.end_date)}</span>
                     </div>
                   </div>
                   <div className="preview-meta-row">
                     <div className="preview-meta-item">
                       <span className="meta-label">Duration</span>
                       <span className="meta-value">
                         {calculateDuration(formData.start_date, formData.end_date, formData.duration)}
                       </span>
                     </div>
                     <div className="preview-meta-item">
                       <span className="meta-label">Location</span>
                       <span className="meta-value">{formData.location || 'N/A'}</span>
                     </div>
                   </div>
                 </div>

                 {/* Preview Detail Sections */}
                 <div className="preview-details-section">
                   
                   {/* Key Responsibilities */}
                   {formData.key_responsibilities.length > 0 && (
                     <div className="preview-detail-group">
                       <div className="preview-detail-header">
                         <span className="detail-icon">📋</span>
                         <span className="detail-title">Key Responsibilities ({formData.key_responsibilities.length})</span>
                       </div>
                       <ul className="preview-responsibilities-list">
                         {formData.key_responsibilities.slice(0, 3).map((responsibility, index) => (
                           <li key={index} className="preview-responsibility-item">
                             <span className="responsibility-bullet">▸</span>
                             <span className="responsibility-text">{responsibility}</span>
                           </li>
                         ))}
                         {formData.key_responsibilities.length > 3 && (
                           <li className="preview-more-items">
                             +{formData.key_responsibilities.length - 3} more responsibilities
                           </li>
                         )}
                       </ul>
                     </div>
                   )}

                   {/* Technologies */}
                   {formData.technologies.length > 0 && (
                     <div className="preview-detail-group">
                       <div className="preview-detail-header">
                         <span className="detail-icon">🛠️</span>
                         <span className="detail-title">Technologies ({formData.technologies.length})</span>
                       </div>
                       <div className="preview-tech-grid">
                         {formData.technologies.slice(0, 6).map((tech, index) => (
                           <span key={index} className="preview-tech-tag">
                             {tech}
                           </span>
                         ))}
                         {formData.technologies.length > 6 && (
                           <span className="preview-tech-tag more">
                             +{formData.technologies.length - 6}
                           </span>
                         )}
                       </div>
                     </div>
                   )}

                   {/* Achievements */}
                   {formData.achievements.length > 0 && (
                     <div className="preview-detail-group">
                       <div className="preview-detail-header">
                         <span className="detail-icon">🏆</span>
                         <span className="detail-title">Achievements ({formData.achievements.length})</span>
                       </div>
                       <ul className="preview-achievements-list">
                         {formData.achievements.slice(0, 3).map((achievement, index) => (
                           <li key={index} className="preview-achievement-item">
                             <span className="achievement-bullet">▸</span>
                             <span className="achievement-text">{achievement}</span>
                           </li>
                         ))}
                         {formData.achievements.length > 3 && (
                           <li className="preview-more-items">
                             +{formData.achievements.length - 3} more achievements
                           </li>
                         )}
                       </ul>
                     </div>
                   )}

                   {/* Skills Gained */}
                   {formData.skills_gained.length > 0 && (
                     <div className="preview-detail-group">
                       <div className="preview-detail-header">
                         <span className="detail-icon">🧠</span>
                         <span className="detail-title">Skills Gained ({formData.skills_gained.length})</span>
                       </div>
                       <div className="preview-skills-grid">
                         {formData.skills_gained.slice(0, 6).map((skill, index) => (
                           <span key={index} className="preview-skill-tag">
                             {skill}
                           </span>
                         ))}
                         {formData.skills_gained.length > 6 && (
                           <span className="preview-skill-tag more">
                             +{formData.skills_gained.length - 6}
                           </span>
                         )}
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Preview Action Buttons */}
                 {formData.certificate_urls.length > 0 && (
                   <div className="preview-action-section">
                     <div className="preview-action-btn certificates-btn">
                       <span className="btn-icon">📜</span>
                       <span className="btn-text">Certificates ({formData.certificate_urls.length})</span>
                     </div>
                   </div>
                 )}
               </div>
             </div>

             {/* Preview Status */}
             <div className="preview-status">
               <span className={`status-indicator ${formData.status}`}>
                 {formData.status === 'active' && '🟢 Active'}
                 {formData.status === 'draft' && '🟡 Draft'}
                 {formData.status === 'archived' && '🔴 Archived'}
               </span>
             </div>
           </div>
         </div>
       )}
     </div>
   </div>
 );
};

export default InternshipsManager;