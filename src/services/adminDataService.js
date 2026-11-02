// src/services/adminDataService.js - NEW FILE FOR ADMIN OPERATIONS

import { supabase } from './supabaseClient';

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
    
    // Create admin client
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
    );

    let result;
    
    if (existingId) {
      // Update existing record
      const { data: updatedData, error } = await supabaseAdmin
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
      const { data: newData, error } = await supabaseAdmin
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