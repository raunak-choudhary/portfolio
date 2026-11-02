// src/hooks/useSupabase.js - CLEAN PRODUCTION VERSION

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * Custom hook for Supabase data fetching with real-time updates
 */
export const useSupabase = (table, filters = {}, options = {}) => {
  // State management
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Refs for cleanup
  const subscriptionRef = useRef(null);
  const mountedRef = useRef(true);

  // Destructure options with defaults
  const {
    select = '*',
    orderBy = null,
    limit = null,
    single = false,
    enabled = true,
    realtime = true,
    cacheKey = null
  } = options;

  // Stringify objects to prevent infinite re-renders
  const filtersString = JSON.stringify(filters);
  const orderByString = JSON.stringify(orderBy);

  /**
   * Main data fetching function
   */
  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled || !table || !mountedRef.current) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const parsedFilters = JSON.parse(filtersString);
      const parsedOrderBy = JSON.parse(orderByString);

      // Build query
      let query = supabase.from(table).select(select);

      // Apply filters
      Object.entries(parsedFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value.operator) {
            // Handle custom operators
            switch (value.operator) {
              case 'gte': query = query.gte(key, value.value); break;
              case 'lte': query = query.lte(key, value.value); break;
              case 'gt': query = query.gt(key, value.value); break;
              case 'lt': query = query.lt(key, value.value); break;
              case 'like': query = query.like(key, value.value); break;
              case 'ilike': query = query.ilike(key, value.value); break;
              case 'neq': query = query.neq(key, value.value); break;
              default: query = query.eq(key, value.value);
            }
          } else {
            query = query.eq(key, value);
          }
        }
      });

      // Apply ordering
      if (parsedOrderBy) {
        if (Array.isArray(parsedOrderBy)) {
          parsedOrderBy.forEach(order => {
            query = query.order(order.column, { ascending: order.ascending !== false });
          });
        } else if (typeof parsedOrderBy === 'object') {
          query = query.order(parsedOrderBy.column, { ascending: parsedOrderBy.ascending !== false });
        } else {
          query = query.order(parsedOrderBy, { ascending: false });
        }
      } else {
        // Default ordering by created_at if no order specified
        query = query.order('created_at', { ascending: false });
      }

      // Apply limit
      if (limit && typeof limit === 'number') {
        query = query.limit(limit);
      }

      // Execute query
      const { data: result, error: queryError } = single 
        ? await query.single()
        : await query;

      if (queryError && queryError.code !== 'PGRST116') {
        throw queryError;
      }

      // Handle "no rows returned" for single queries
      if (queryError && queryError.code === 'PGRST116' && single) {
        if (mountedRef.current) {
          setData(null);
          setError(null);
          setLastRefresh(Date.now());
        }
        return;
      }
      
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLastRefresh(Date.now());
      }

    } catch (err) {
      if (mountedRef.current) {
        // Provide user-friendly error messages
        let userFriendlyError = err.message;
        
        if (err.code === 'PGRST116') {
          userFriendlyError = single 
            ? `No ${table.replace(/_/g, ' ')} record found`
            : `No ${table.replace(/_/g, ' ')} records found`;
        } else if (err.message?.includes('JWT')) {
          userFriendlyError = 'Authentication expired. Please refresh the page.';
        } else if (err.message?.includes('permission denied')) {
          userFriendlyError = 'Permission denied. You may not have access to this data.';
        } else if (err.message?.includes('relation') && err.message?.includes('does not exist')) {
          userFriendlyError = `Database table '${table}' not found.`;
        }

        setError({
          message: userFriendlyError,
          code: err.code || 'UNKNOWN_ERROR',
          details: err.message,
          table: table
        });
        setData(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [table, filtersString, orderByString, select, limit, single, enabled]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  /**
   * Clear data and reset states
   */
  const reset = useCallback(() => {
    if (mountedRef.current) {
      setData(null);
      setError(null);
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  // Real-time subscription
  useEffect(() => {
    if (!realtime || !table || !enabled || !mountedRef.current) return;

    const channelName = `public:${table}:${cacheKey || Date.now()}`;
    
    // Clean up existing subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: table 
      }, (payload) => {
        if (mountedRef.current) {
          // Add a small delay to ensure database consistency
          setTimeout(() => {
            if (mountedRef.current) {
              refetch();
            }
          }, 300);
        }
      })
      .subscribe();

    subscriptionRef.current = subscription;

    // Cleanup function
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [table, realtime, enabled, refetch, cacheKey]);

  // Global refresh listener for admin changes
  useEffect(() => {
    const handleAdminRefresh = (event) => {
      if ((event.detail?.table === table || event.detail?.table === 'all') && mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) {
            refetch();
          }
        }, 100);
      }
    };

    const handlePortfolioUpdate = (event) => {
      if ((event.detail?.table === table || event.detail?.table === 'all') && mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) {
            refetch();
          }
        }, 100);
      }
    };

    window.addEventListener('adminDataChange', handleAdminRefresh);
    window.addEventListener('portfolioDataUpdated', handlePortfolioUpdate);
    
    return () => {
      window.removeEventListener('adminDataChange', handleAdminRefresh);
      window.removeEventListener('portfolioDataUpdated', handlePortfolioUpdate);
    };
  }, [table, refetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
    reset,
    lastRefresh
  };
};

/**
 * Get record by ID
 */
export const useSupabaseById = (table, id, options = {}) => {
  return useSupabase(
    table,
    { id },
    {
      ...options,
      single: true,
      enabled: !!id && options.enabled !== false
    }
  );
};

/**
 * Get records by status with enhanced filtering
 */
export const useSupabaseByStatus = (table, status = 'active', additionalFilters = {}, options = {}) => {
  const filters = status === 'active' 
    ? { ...additionalFilters }
    : { status, ...additionalFilters };

  return useSupabase(table, filters, options);
};

/**
 * Paginated data fetching
 */
export const useSupabasePaginated = (table, filters = {}, page = 0, pageSize = 10, options = {}) => {
  const offset = page * pageSize;
  
  return useSupabase(
    table,
    filters,
    {
      ...options,
      limit: pageSize,
      offset: offset
    }
  );
};

export default useSupabase;