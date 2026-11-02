// src/services/adminDataService.js - shared admin operations

import { supabase } from './supabaseClient';

export const getAdminSupabaseClient = () => supabase;

export const sanitizeStorageSegment = (value, fallback = 'file') => {
  const sanitized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
};

export const getFileExtension = (fileName, fallback = 'bin') => {
  const extension = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return extension || fallback;
};

export const buildAdminStoragePath = ({
  folder,
  entityName,
  label,
  file,
  timestamp = Date.now()
}) => {
  const safeFolder = sanitizeStorageSegment(folder, 'admin');
  const safeEntity = sanitizeStorageSegment(entityName, 'file');
  const safeLabel = sanitizeStorageSegment(label, 'upload');
  const extension = getFileExtension(file?.name);

  return `${safeFolder}/${safeEntity}-${safeLabel}-${timestamp}.${extension}`;
};

export const uploadAdminPublicFile = async ({
  bucket,
  filePath,
  file,
  cacheControl = '3600',
  upsert = false
}) => {
  const storage = getAdminSupabaseClient().storage.from(bucket);
  const { error } = await storage.upload(filePath, file, {
    cacheControl,
    upsert
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: urlData } = storage.getPublicUrl(filePath);

  return {
    success: true,
    bucket,
    filePath,
    publicUrl: urlData.publicUrl
  };
};

export const extractPublicStoragePath = (value, bucketName) => {
  if (!value || !bucketName || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const publicMarker = `/storage/v1/object/public/${bucketName}/`;
  const signedMarker = `/storage/v1/object/sign/${bucketName}/`;

  if (trimmed.includes(publicMarker)) {
    return decodeURIComponent(trimmed.split(publicMarker)[1].split('?')[0]);
  }

  if (trimmed.includes(signedMarker)) {
    return decodeURIComponent(trimmed.split(signedMarker)[1].split('?')[0]);
  }

  if (trimmed.startsWith(`${bucketName}/`)) {
    return trimmed.slice(bucketName.length + 1);
  }

  if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
    return trimmed;
  }

  return null;
};

export const extractPublicStoragePaths = (values, bucketName) => {
  const list = Array.isArray(values) ? values : [values];
  const paths = list
    .map(value => extractPublicStoragePath(value, bucketName))
    .filter(Boolean);

  return Array.from(new Set(paths));
};

export const removeAdminStorageFiles = async (bucketName, values) => {
  const filePaths = extractPublicStoragePaths(values, bucketName);

  if (filePaths.length === 0) {
    return {
      success: true,
      bucket: bucketName,
      filePaths: [],
      skipped: true
    };
  }

  const { data, error } = await getAdminSupabaseClient()
    .storage
    .from(bucketName)
    .remove(filePaths);

  if (error) {
    throw new Error(`Failed to remove storage files: ${error.message}`);
  }

  return {
    success: true,
    bucket: bucketName,
    filePaths,
    data
  };
};

export const normalizeContactAttachments = (message = {}) => {
  const arrayPaths = Array.isArray(message.attachment_urls)
    ? message.attachment_urls.filter(Boolean)
    : [];
  const arrayNames = Array.isArray(message.attachment_names)
    ? message.attachment_names
    : [];

  const paths = arrayPaths.length > 0
    ? arrayPaths
    : [message.attachment_url].filter(Boolean);

  return paths.map((path, index) => ({
    key: `${index}-${path}`,
    path,
    name: arrayNames[index] || (index === 0 ? message.attachment_name : null) || `attachment-${index + 1}`,
    size: index === 0 ? (message.attachment_size || null) : null
  }));
};

export const createContactAttachmentSignedUrl = async (filePath, expiresIn = 300) => {
  if (!filePath) {
    throw new Error('Attachment path is required');
  }

  const { data, error } = await getAdminSupabaseClient()
    .storage
    .from('contact-attachments')
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create attachment link: ${error.message}`);
  }

  return {
    success: true,
    filePath,
    signedUrl: data.signedUrl,
    expiresIn
  };
};

/**
 * Trigger refresh event for public portfolio components
 */
const triggerPublicRefresh = (table = 'all') => {
  console.log(`📢 Triggering public portfolio refresh for table: ${table}`);
  
  // Custom event to notify public components
  window.dispatchEvent(new CustomEvent('adminDataChange', {
    detail: { table, timestamp: Date.now() }
  }));
  
  // Also trigger a general refresh event
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('portfolioDataUpdated', {
      detail: { table, timestamp: Date.now() }
    }));
  }, 100);
};

/**
 * Enhanced save function for admin operations
 */
export const saveAdminData = async (table, data, existingId = null) => {
  try {
    console.log(`💾 Admin save operation starting for ${table}:`, data);

    let result;
    
    if (existingId) {
      // Update existing record
      const { data: updatedData, error } = await getAdminSupabaseClient()
        .from(table)
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingId)
        .select()
        .single();
        
      if (error) throw error;
      result = { success: true, data: updatedData };
    } else {
      // Create new record
      const { data: newData, error } = await getAdminSupabaseClient()
        .from(table)
        .insert([data])
        .select()
        .single();
        
      if (error) throw error;
      result = { success: true, data: newData };
    }
    
    console.log(`✅ Admin save successful for ${table}:`, result);
    
    // Trigger refresh for public components
    triggerPublicRefresh(table);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Admin save failed for ${table}:`, error);
    throw error;
  }
};

export { triggerPublicRefresh };
