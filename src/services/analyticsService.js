// src/services/analyticsService.js - PRODUCTION VERSION - NO MOCK DATA
import { supabase } from './supabaseClient';

// =====================================================
// ANALYTICS SERVICE FOR RC PORTFOLIO - REAL DATA ONLY
// Complete data collection, processing, and retrieval
// =====================================================

// ===== CORE DATA COLLECTION FUNCTIONS =====

/**
 * Track user/admin events throughout the system
 */
export const trackEvent = async (eventType, category, action, label = null, value = null, metadata = {}, userType = 'visitor', sessionId = null) => {
  try {
    const { data, error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: eventType,
          event_category: category,
          event_action: action,
          event_label: label,
          event_value: value,
          user_type: userType,
          session_id: sessionId || generateSessionId(),
          metadata: metadata,
          timestamp: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Error tracking event:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in trackEvent:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Track content view events for portfolio sections
 */
export const trackContentView = async (contentType, contentId) => {
  try {
    // Track the view event
    await trackEvent('content_view', 'portfolio', `view_${contentType}`, contentId, 1);

    // Update content performance tracking
    const today = new Date().toISOString().split('T')[0];
    
    const { data: existing } = await supabase
      .from('content_performance')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .eq('performance_date', today)
      .single();

    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('content_performance')
        .update({
          view_count: existing.view_count + 1,
          last_updated: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) console.error('Error updating content performance:', error);
    } else {
      // Create new record
      const { error } = await supabase
        .from('content_performance')
        .insert([
          {
            content_type: contentType,
            content_id: contentId,
            performance_date: today,
            view_count: 1,
            engagement_score: 10,
            last_updated: new Date().toISOString()
          }
        ]);

      if (error) console.error('Error creating content performance record:', error);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in trackContentView:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Track admin session activity and productivity
 */
export const trackAdminSession = async (sessionStart, sessionEnd, sectionsVisited = [], actionsPerformed = 0) => {
  try {
    const sessionId = generateSessionId();
    const duration = Math.round((sessionEnd - sessionStart) / (1000 * 60));

    const { data, error } = await supabase
      .from('admin_sessions')
      .insert([
        {
          session_id: sessionId,
          start_time: sessionStart.toISOString(),
          end_time: sessionEnd.toISOString(),
          duration_minutes: duration,
          sections_visited: sectionsVisited,
          actions_performed: actionsPerformed,
          last_activity: sessionEnd.toISOString()
        }
      ]);

    if (error) {
      console.error('Error tracking admin session:', error);
      return { success: false, error };
    }

    await updateAdminActivityAnalytics(sessionStart, duration, sectionsVisited.length, actionsPerformed);
    return { success: true, data };
  } catch (error) {
    console.error('Error in trackAdminSession:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Track content updates made by admin
 */
export const trackContentUpdate = async (contentType, contentId, updateType, changes = {}) => {
  try {
    await trackEvent(
      'content_update',
      'admin',
      `${updateType}_${contentType}`,
      contentId,
      1,
      { changes, timestamp: new Date().toISOString() },
      'admin'
    );

    if (updateType === 'edit') {
      const today = new Date().toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('content_performance')
        .upsert([
          {
            content_type: contentType,
            content_id: contentId,
            performance_date: today,
            last_updated: new Date().toISOString(),
            engagement_score: 15
          }
        ]);

      if (error) console.error('Error updating content performance:', error);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in trackContentUpdate:', error);
    return { success: false, error: error.message };
  }
};

// ===== METRICS CALCULATION FUNCTIONS =====

/**
 * Calculate overall portfolio completeness score - REAL DATA ONLY
 */
export const calculatePortfolioCompleteness = async () => {
  try {
    const { data, error } = await supabase.rpc('calculate_portfolio_completeness');
    
    if (error) {
      console.error('Error calculating portfolio completeness:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in calculatePortfolioCompleteness:', error);
    return 0;
  }
};

/**
 * Calculate content engagement scores - REAL DATA ONLY
 */
export const calculateContentEngagement = async (contentType = null, days = 30) => {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('🔍 Calculating content engagement for days:', days);

    let query = supabase
      .from('content_performance')
      .select('*')
      .gte('performance_date', startDate)
      .order('engagement_score', { ascending: false });

    if (contentType) {
      query = query.eq('content_type', contentType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error calculating content engagement:', error);
      return {
        totalViews: 0,
        avgEngagementScore: 0,
        contentCompleteness: 0,
        activeContent: 0,
        popularContent: 0,
        engagementRate: 0
      };
    }

    if (!data || data.length === 0) {
      console.log('⚠️ No engagement data found');
      return {
        totalViews: 0,
        avgEngagementScore: 0,
        contentCompleteness: 0,
        activeContent: 0,
        popularContent: 0,
        engagementRate: 0
      };
    }

    console.log('✅ Found engagement data:', data.length, 'records');

    // Calculate real metrics from your data
    const totalViews = data.reduce((sum, item) => sum + (item.view_count || 0), 0);
    const avgEngagementScore = data.reduce((sum, item) => sum + (item.engagement_score || 0), 0) / data.length;
    const activeContent = data.filter(item => item.view_count > 0).length;
    const popularContent = data.filter(item => item.engagement_score >= 8).length;
    
    // Get portfolio completeness from database function
    const { data: completenessData } = await supabase.rpc('calculate_portfolio_completeness');
    const contentCompleteness = completenessData || 0;

    const result = {
      totalViews,
      avgEngagementScore: Math.round(avgEngagementScore * 10) / 10,
      contentCompleteness: Math.round(contentCompleteness),
      activeContent,
      popularContent,
      engagementRate: totalViews > 0 ? Math.round((activeContent / data.length) * 100) : 0,
      // Add trend data for change calculations
      viewsChange: calculateViewsChange(data),
      engagementChange: calculateEngagementChange(data),
      completenessChange: 0, // Can be calculated with historical data
      activeContentChange: 0,
      popularContentChange: 0,
      engagementRateChange: 0
    };

    console.log('✅ Calculated content engagement:', result);
    return result;

  } catch (error) {
    console.error('❌ Error in calculateContentEngagement:', error);
    return {
      totalViews: 0,
      avgEngagementScore: 0,
      contentCompleteness: 0,
      activeContent: 0,
      popularContent: 0,
      engagementRate: 0
    };
  }
};

/**
 * Calculate admin productivity metrics - REAL DATA ONLY
 */
export const calculateAdminProductivity = async (days = 30) => {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { data: sessions, error: sessionsError } = await supabase
      .from('admin_sessions')
      .select('*')
      .gte('start_time', startDate);

    if (sessionsError) {
      console.error('Error calculating admin productivity:', sessionsError);
      return {};
    }

    if (!sessions || sessions.length === 0) {
      return {
        totalSessions: 0,
        totalTime: 0,
        avgSessionTime: 0,
        totalActions: 0,
        actionsPerMinute: 0,
        mostUsedSection: null,
        sectionUsage: {},
        productivityScore: 0
      };
    }

    const totalSessions = sessions.length;
    const totalTime = sessions.reduce((sum, session) => sum + (session.duration_minutes || 0), 0);
    const avgSessionTime = totalSessions > 0 ? totalTime / totalSessions : 0;
    const totalActions = sessions.reduce((sum, session) => sum + (session.actions_performed || 0), 0);
    const actionsPerMinute = totalTime > 0 ? totalActions / totalTime : 0;

    const sectionCounts = {};
    sessions.forEach(session => {
      session.sections_visited?.forEach(section => {
        sectionCounts[section] = (sectionCounts[section] || 0) + 1;
      });
    });

    const mostUsedSection = Object.keys(sectionCounts).reduce((a, b) => 
      sectionCounts[a] > sectionCounts[b] ? a : b, null
    );

    return {
      totalSessions,
      totalTime,
      avgSessionTime: Math.round(avgSessionTime),
      totalActions,
      actionsPerMinute: Math.round(actionsPerMinute * 100) / 100,
      mostUsedSection,
      sectionUsage: sectionCounts,
      productivityScore: Math.min(100, Math.round(actionsPerMinute * 10 + (totalSessions * 2)))
    };
  } catch (error) {
    console.error('Error in calculateAdminProductivity:', error);
    return {};
  }
};

/**
 * Calculate contact form trends and patterns - REAL DATA ONLY
 */
export const calculateContactTrends = async (days = 30) => {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: messages, error } = await supabase
      .from('contact_messages')
      .select('*')
      .gte('created_at', startDate);

    if (error) {
      console.error('Error calculating contact trends:', error);
      return {};
    }

    if (!messages || messages.length === 0) {
      return {
        totalMessages: 0,
        contactTypes: {},
        peakHours: {},
        avgResponseTime: 0,
        popularSubjects: [],
        dailyTrend: []
      };
    }

    // Analyze contact types using correct column name
    const contactTypes = {};
    messages.forEach(msg => {
      const type = msg.inquiry_type || 'other';
      contactTypes[type] = (contactTypes[type] || 0) + 1;
    });

    // Analyze peak hours
    const peakHours = {};
    messages.forEach(msg => {
      const hour = new Date(msg.created_at).getHours();
      peakHours[hour] = (peakHours[hour] || 0) + 1;
    });

    // Find most common subjects
    const subjects = messages.map(msg => msg.subject?.toLowerCase()).filter(Boolean);
    const subjectCounts = {};
    subjects.forEach(subject => {
      subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
    });

    const popularSubjects = Object.entries(subjectCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([subject, count]) => ({ subject, count }));

    return {
      totalMessages: messages.length,
      contactTypes,
      peakHours,
      avgResponseTime: 0,
      popularSubjects,
      dailyTrend: calculateDailyTrend(messages, days)
    };
  } catch (error) {
    console.error('Error in calculateContactTrends:', error);
    return {};
  }
};

// ===== DATA RETRIEVAL FUNCTIONS =====

/**
 * Get portfolio metrics for a date range - REAL DATA ONLY
 */
export const getPortfolioMetrics = async (startDate = null, endDate = null) => {
  try {
    let query = supabase
      .from('portfolio_metrics')
      .select('*')
      .order('metric_date', { ascending: false });

    if (startDate) {
      query = query.gte('metric_date', startDate);
    }
    if (endDate) {
      query = query.lte('metric_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting portfolio metrics:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getPortfolioMetrics:', error);
    return [];
  }
};

/**
 * Get content analytics for specific content type - REAL DATA ONLY
 */
export const getContentAnalytics = async (contentType = null, dateRange = '30d') => {
  try {
    const days = parseDateRange(dateRange);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let query = supabase
      .from('content_performance')
      .select('*')
      .gte('performance_date', startDate)
      .order('performance_date', { ascending: false });

    if (contentType) {
      query = query.eq('content_type', contentType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting content analytics:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getContentAnalytics:', error);
    return [];
  }
};

/**
 * Get contact analytics for date range - REAL DATA ONLY
 */
export const getContactAnalytics = async (dateRange = '30d') => {
  try {
    const days = parseDateRange(dateRange);
    return await calculateContactTrends(days);
  } catch (error) {
    console.error('Error in getContactAnalytics:', error);
    return {};
  }
};

/**
 * Get admin activity analytics - REAL DATA ONLY
 */
export const getAdminActivityAnalytics = async (dateRange = '30d') => {
  try {
    const days = parseDateRange(dateRange);
    return await calculateAdminProductivity(days);
  } catch (error) {
    console.error('Error in getAdminActivityAnalytics:', error);
    return {};
  }
};

/**
 * Get trend analysis for specific metric - REAL DATA ONLY
 */
export const getTrendAnalysis = async (metricType, timeframe = '30d') => {
  try {
    const days = parseDateRange(timeframe);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let data = [];
    let tableName = '';

    switch (metricType) {
      case 'portfolio_completeness':
        tableName = 'portfolio_metrics';
        break;
      case 'contact_volume':
        tableName = 'contact_analytics';
        break;
      case 'admin_productivity':
        tableName = 'admin_activity_analytics';
        break;
      default:
        return { trend: 'stable', data: [], change: 0 };
    }

    const { data: trendData, error } = await supabase
      .from(tableName)
      .select('*')
      .gte(tableName === 'portfolio_metrics' ? 'metric_date' : 'analysis_date', startDate)
      .order(tableName === 'portfolio_metrics' ? 'metric_date' : 'analysis_date', { ascending: true });

    if (error) {
      console.error('Error getting trend analysis:', error);
      return { trend: 'stable', data: [], change: 0 };
    }

    data = trendData || [];

    if (data.length < 2) {
      return { trend: 'stable', data, change: 0 };
    }

    const firstValue = getMetricValue(data[0], metricType);
    const lastValue = getMetricValue(data[data.length - 1], metricType);
    const change = ((lastValue - firstValue) / firstValue) * 100;

    let trend = 'stable';
    if (change > 5) trend = 'increasing';
    else if (change < -5) trend = 'decreasing';

    return {
      trend,
      data,
      change: Math.round(change * 100) / 100,
      firstValue,
      lastValue
    };
  } catch (error) {
    console.error('Error in getTrendAnalysis:', error);
    return { trend: 'stable', data: [], change: 0 };
  }
};

// ===== CONTENT ANALYTICS FUNCTIONS - REAL DATA ONLY =====

/**
 * Get section performance data for Content Analytics - REAL DATA ONLY
 */
export const getSectionPerformance = async (dateRange = '30d') => {
  try {
    const days = parseDateRange(dateRange);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('🔍 Getting section performance for date range:', dateRange, 'start date:', startDate);
    
    const { data: performanceData, error } = await supabase
      .from('content_performance')
      .select('*')
      .gte('performance_date', startDate);
    
    if (error) {
      console.error('❌ Error getting section performance:', error);
      return [];
    }

    if (!performanceData || performanceData.length === 0) {
      console.log('⚠️ No performance data found, returning empty array');
      return [];
    }

    console.log('✅ Found performance data:', performanceData.length, 'records');

    // Process real data by section - fixed for your structure
    const sectionMap = {};
    performanceData.forEach(item => {
      const section = item.content_type || 'Unknown';
      if (!sectionMap[section]) {
        sectionMap[section] = {
          section,
          views: 0,
          engagement: 0,
          completeness: 75, // Default completeness
          count: 0
        };
      }
      sectionMap[section].views += item.view_count || 0;
      sectionMap[section].engagement += item.engagement_score || 0;
      sectionMap[section].count++;
    });
    
    // Calculate averages and sort by views
    const result = Object.values(sectionMap)
      .map(section => ({
        ...section,
        engagement: section.count > 0 ? Math.round((section.engagement / section.count) * 10) / 10 : 0,
        performance: Math.round((section.views * 0.4) + ((section.engagement / section.count) * 0.6))
      }))
      .sort((a, b) => b.views - a.views);

    console.log('✅ Processed section performance:', result);
    return result;

  } catch (error) {
    console.error('❌ Error in getSectionPerformance:', error);
    return [];
  }
};

/**
 * Get top performing content for Content Analytics - REAL DATA ONLY
 */
export const getTopPerformingContent = async (dateRange = '30d') => {
  try {
    const days = parseDateRange(dateRange);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('🔍 Getting top performing content for date range:', dateRange);
    
    const { data: contentData, error } = await supabase
      .from('content_performance')
      .select('*')
      .gte('performance_date', startDate)
      .order('view_count', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error getting top performing content:', error);
      return [];
    }

    if (!contentData || contentData.length === 0) {
      console.log('⚠️ No content data found, returning empty array');
      return [];
    }

    console.log('✅ Found top performing content:', contentData.length, 'records');

    const result = contentData.map(item => ({
      title: `${item.content_type} Section`,
      type: item.content_type,
      section: item.content_type,
      views: item.view_count || 0,
      engagement: item.engagement_score || 0
    }));

    console.log('✅ Processed top performing content:', result);
    return result;

  } catch (error) {
    console.error('❌ Error getting top performing content:', error);
    return [];
  }
};

/**
 * Get content engagement history for charts - REAL DATA ONLY
 */
export const getContentEngagementHistory = async (dateRange = '30d') => {
  try {
    const days = parseDateRange(dateRange);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    console.log('🔍 Getting content engagement history for date range:', dateRange);
    
    const { data: historyData, error } = await supabase
      .from('content_performance')
      .select('performance_date, engagement_score')
      .gte('performance_date', startDate.toISOString().split('T')[0])
      .order('performance_date', { ascending: true });
    
    if (error) {
      console.error('❌ Error getting content engagement history:', error);
      return [];
    }

    if (!historyData || historyData.length === 0) {
      console.log('⚠️ No history data found, returning empty array');
      return [];
    }

    console.log('✅ Found engagement history:', historyData.length, 'records');

    // Group by date and calculate daily averages
    const dailyEngagement = {};
    historyData.forEach(item => {
      const date = item.performance_date;
      if (!dailyEngagement[date]) {
        dailyEngagement[date] = { total: 0, count: 0 };
      }
      dailyEngagement[date].total += item.engagement_score || 0;
      dailyEngagement[date].count++;
    });
    
    const result = Object.entries(dailyEngagement).map(([date, data]) => ({
      date,
      engagement: Math.round((data.total / data.count) * 10) / 10
    }));

    console.log('✅ Processed engagement history:', result);
    return result;

  } catch (error) {
    console.error('❌ Error getting content engagement history:', error);
    return [];
  }
};

/**
 * Get section completeness data for Portfolio Metrics - REAL DATA ONLY
 */
export const getSectionCompleteness = async () => {
  try {
    const [
      { data: projects },
      { data: skills },
      { data: education },
      { data: workExperience },
      { data: internships },
      { data: certifications },
      { data: recommendations },
      { data: achievements },
      { data: leadership }
    ] = await Promise.all([
      supabase.from('projects').select('id'),
      supabase.from('skills').select('id'),
      supabase.from('education').select('id'),
      supabase.from('work_experience').select('id'),
      supabase.from('internships').select('id'),
      supabase.from('certifications').select('id'),
      supabase.from('recommendations').select('id'),
      supabase.from('achievements').select('id'),
      supabase.from('leadership').select('id')
    ]);

    const sections = [
      {
        name: 'Projects',
        weight: 25,
        completeness: Math.min(100, (projects?.length || 0) * 20)
      },
      {
        name: 'Skills',
        weight: 15,
        completeness: Math.min(100, (skills?.length || 0) * 5)
      },
      {
        name: 'Education',
        weight: 15,
        completeness: Math.min(100, (education?.length || 0) * 50)
      },
      {
        name: 'Work Experience',
        weight: 15,
        completeness: Math.min(100, (workExperience?.length || 0) * 25)
      },
      {
        name: 'Internships',
        weight: 10,
        completeness: Math.min(100, (internships?.length || 0) * 25)
      },
      {
        name: 'Certifications',
        weight: 10,
        completeness: Math.min(100, (certifications?.length || 0) * 10)
      },
      {
        name: 'Recommendations',
        weight: 5,
        completeness: Math.min(100, (recommendations?.length || 0) * 20)
      },
      {
        name: 'Achievements',
        weight: 5,
        completeness: Math.min(100, (achievements?.length || 0) * 10)
      },
      {
        name: 'Leadership',
        weight: 5, // REDUCED FROM 5
        completeness: Math.min(100, (leadership?.length || 0) * 20)
      }
    ];

    return sections;
  } catch (error) {
    console.error('Error getting section completeness:', error);
    return [];
  }
};

// ===== COMPARISON FUNCTIONS =====

/**
 * Compare performance between two time periods - REAL DATA ONLY
 */
export const comparePerformancePeriods = async (period1Start, period1End, period2Start, period2End) => {
  try {
    const period1Portfolio = await getPortfolioMetrics(period1Start, period1End);
    const period2Portfolio = await getPortfolioMetrics(period2Start, period2End);

    const period1Avg = calculatePeriodAverages(period1Portfolio);
    const period2Avg = calculatePeriodAverages(period2Portfolio);

    const changes = {};
    Object.keys(period1Avg).forEach(key => {
      if (period1Avg[key] > 0) {
        changes[key] = ((period2Avg[key] - period1Avg[key]) / period1Avg[key]) * 100;
      } else {
        changes[key] = period2Avg[key] > 0 ? 100 : 0;
      }
    });

    return {
      period1: { start: period1Start, end: period1End, metrics: period1Avg },
      period2: { start: period2Start, end: period2End, metrics: period2Avg },
      changes,
      summary: {
        improvement: Object.values(changes).filter(change => change > 0).length,
        decline: Object.values(changes).filter(change => change < 0).length,
        stable: Object.values(changes).filter(change => Math.abs(change) < 5).length
      }
    };
  } catch (error) {
    console.error('Error comparing performance periods:', error);
    return null;
  }
};

/**
 * Benchmark current metrics against historical performance - REAL DATA ONLY
 */
export const benchmarkMetrics = async (metricType = 'portfolio_completeness', days = 90) => {
  try {
    const trendData = await getTrendAnalysis(metricType, `${days}d`);
    
    if (!trendData.data || trendData.data.length === 0) {
      return { 
        benchmark: 'insufficient_data', 
        percentile: 0, 
        recommendation: 'Collect more data for benchmarking' 
      };
    }

    const values = trendData.data.map(item => getMetricValue(item, metricType)).filter(val => val > 0);
    const currentValue = trendData.lastValue;

    if (values.length === 0) {
      return { 
        benchmark: 'no_data', 
        percentile: 0, 
        recommendation: 'No valid data for benchmarking' 
      };
    }

    const sortedValues = [...values].sort((a, b) => a - b);
    const percentile = Math.round((sortedValues.filter(val => val <= currentValue).length / sortedValues.length) * 100);

    let benchmark = 'average';
    let recommendation = 'Maintain current performance levels';

    if (percentile >= 80) {
      benchmark = 'excellent';
      recommendation = 'Outstanding performance! Consider sharing best practices';
    } else if (percentile >= 60) {
      benchmark = 'good';
      recommendation = 'Good performance with room for optimization';
    } else if (percentile >= 40) {
      benchmark = 'average';
      recommendation = 'Performance is average. Focus on key improvement areas';
    } else {
      benchmark = 'below_average';
      recommendation = 'Performance needs attention. Review strategy and processes';
    }

    return {
      benchmark,
      percentile,
      currentValue,
      average: Math.round(values.reduce((sum, val) => sum + val, 0) / values.length),
      median: sortedValues[Math.floor(sortedValues.length / 2)],
      min: Math.min(...values),
      max: Math.max(...values),
      recommendation
    };
  } catch (error) {
    console.error('Error benchmarking metrics:', error);
    return { benchmark: 'error', percentile: 0, recommendation: 'Unable to calculate benchmark' };
  }
};

/**
 * Identify trends in metrics over time - REAL DATA ONLY
 */
export const identifyTrends = async (metricType, timeframe = '30d') => {
  try {
    const trendData = await getTrendAnalysis(metricType, timeframe);
    
    if (!trendData.data || trendData.data.length < 3) {
      return { trend: 'insufficient_data', patterns: [], forecast: null };
    }

    const values = trendData.data.map(item => getMetricValue(item, metricType));
    
    const patterns = [];
    
    const consistentGrowth = values.every((val, idx) => idx === 0 || val >= values[idx - 1]);
    const consistentDecline = values.every((val, idx) => idx === 0 || val <= values[idx - 1]);
    
    if (consistentGrowth && values[values.length - 1] > values[0]) {
      patterns.push('consistent_growth');
    } else if (consistentDecline && values[values.length - 1] < values[0]) {
      patterns.push('consistent_decline');
    }
    
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    if (standardDeviation > average * 0.2) {
      patterns.push('high_volatility');
    } else if (standardDeviation < average * 0.05) {
      patterns.push('stable');
    }
    
    const forecast = calculateLinearForecast(values);
    
    return {
      trend: trendData.trend,
      patterns,
      forecast,
      volatility: {
        standardDeviation: Math.round(standardDeviation * 100) / 100,
        coefficient: Math.round((standardDeviation / average) * 10000) / 100
      },
      insights: generateTrendInsights(patterns, trendData.trend, forecast)
    };
  } catch (error) {
    console.error('Error identifying trends:', error);
    return { trend: 'error', patterns: [], forecast: null };
  }
};

/**
* Detect anomalies in metric patterns - REAL DATA ONLY
*/
export const detectAnomalies = async (metricType, sensitivityLevel = 3) => {
 try {
   const trendData = await getTrendAnalysis(metricType, '30d');
   
   if (!trendData.data || trendData.data.length < 7) {
     return { anomalies: [], status: 'insufficient_data' };
   }

   const values = trendData.data.map(item => getMetricValue(item, metricType));
   const dates = trendData.data.map(item => 
     item.metric_date || item.analysis_date || item.activity_date
   );

   const average = values.reduce((sum, val) => sum + val, 0) / values.length;
   const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
   const standardDeviation = Math.sqrt(variance);
   
   const sensitivityMultiplier = 3 - (sensitivityLevel - 1) * 0.5;
   const threshold = standardDeviation * sensitivityMultiplier;

   const anomalies = [];
   values.forEach((value, index) => {
     const deviation = Math.abs(value - average);
     if (deviation > threshold) {
       anomalies.push({
         date: dates[index],
         value,
         expected: Math.round(average * 100) / 100,
         deviation: Math.round(deviation * 100) / 100,
         type: value > average ? 'spike' : 'drop',
         severity: deviation > threshold * 1.5 ? 'high' : 'medium'
       });
     }
   });

   let status = 'normal';
   let recommendations = [];

   if (anomalies.length > values.length * 0.3) {
     status = 'high_volatility';
     recommendations.push('Consider investigating causes of high volatility');
   } else if (anomalies.length > 0) {
     status = 'anomalies_detected';
     recommendations.push('Review anomalous periods for insights');
   }

   const recentAnomalies = anomalies.filter(anomaly => {
     const anomalyDate = new Date(anomaly.date);
     const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
     return anomalyDate >= threeDaysAgo;
   });

   if (recentAnomalies.length > 0) {
     recommendations.push('Recent anomalies detected - monitor closely');
   }

   return {
     anomalies,
     status,
     summary: {
       total: anomalies.length,
       spikes: anomalies.filter(a => a.type === 'spike').length,
       drops: anomalies.filter(a => a.type === 'drop').length,
       recent: recentAnomalies.length
     },
     statistics: {
       average: Math.round(average * 100) / 100,
       standardDeviation: Math.round(standardDeviation * 100) / 100,
       threshold: Math.round(threshold * 100) / 100
     },
     recommendations
   };
 } catch (error) {
   console.error('Error detecting anomalies:', error);
   return { anomalies: [], status: 'error' };
 }
};

// ===== AGGREGATION FUNCTIONS =====

/**
* Generate daily metrics for all analytics - REAL DATA ONLY
*/
export const generateDailyMetrics = async (date = new Date()) => {
 try {
   const dateStr = date.toISOString().split('T')[0];

   const { error: portfolioError } = await supabase.rpc('generate_daily_portfolio_metrics');
   if (portfolioError) {
     console.error('Error generating portfolio metrics:', portfolioError);
   }

   await generateDailyContactAnalytics(dateStr);
   await generateDailyAdminAnalytics(dateStr);

   return { success: true };
 } catch (error) {
   console.error('Error in generateDailyMetrics:', error);
   return { success: false, error: error.message };
 }
};

/**
* Generate weekly analytics report - REAL DATA ONLY
*/
export const generateWeeklyReport = async () => {
 try {
   const endDate = new Date();
   const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

   const portfolioMetrics = await getPortfolioMetrics(
     startDate.toISOString().split('T')[0],
     endDate.toISOString().split('T')[0]
   );

   const contactAnalytics = await getContactAnalytics('7d');
   const adminActivity = await getAdminActivityAnalytics('7d');
   const contentEngagement = await calculateContentEngagement(null, 7);

   return {
     period: {
       start: startDate.toISOString().split('T')[0],
       end: endDate.toISOString().split('T')[0]
     },
     portfolio: portfolioMetrics,
     contacts: contactAnalytics,
     admin: adminActivity,
     content: contentEngagement,
     summary: {
       totalViews: contentEngagement.reduce((sum, item) => sum + item.total_views, 0),
       totalMessages: contactAnalytics.totalMessages || 0,
       adminSessions: adminActivity.totalSessions || 0,
       productivityScore: adminActivity.productivityScore || 0
     }
   };
 } catch (error) {
   console.error('Error generating weekly report:', error);
   return null;
 }
};

/**
* Generate monthly analytics report - REAL DATA ONLY
*/
export const generateMonthlyReport = async () => {
 try {
   const endDate = new Date();
   const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

   const portfolioMetrics = await getPortfolioMetrics(
     startDate.toISOString().split('T')[0],
     endDate.toISOString().split('T')[0]
   );

   const contactAnalytics = await getContactAnalytics('30d');
   const adminActivity = await getAdminActivityAnalytics('30d');
   const contentEngagement = await calculateContentEngagement(null, 30);

   return {
     period: {
       start: startDate.toISOString().split('T')[0],
       end: endDate.toISOString().split('T')[0]
     },
     portfolio: portfolioMetrics,
     contacts: contactAnalytics,
     admin: adminActivity,
     content: contentEngagement,
     trends: {
       portfolio: await getTrendAnalysis('portfolio_completeness', '30d'),
       contacts: await getTrendAnalysis('contact_volume', '30d'),
       productivity: await getTrendAnalysis('admin_productivity', '30d')
     },
     summary: {
       portfolioCompleteness: await calculatePortfolioCompleteness(),
       totalViews: contentEngagement.reduce((sum, item) => sum + item.total_views, 0),
       totalMessages: contactAnalytics.totalMessages || 0,
       adminSessions: adminActivity.totalSessions || 0,
       avgProductivity: adminActivity.productivityScore || 0
     }
   };
 } catch (error) {
   console.error('Error generating monthly report:', error);
   return null;
 }
};

// ===== EXPORT FUNCTIONS =====

/**
* Export analytics data in specified format - REAL DATA ONLY
*/
export const exportAnalyticsData = async (format = 'json', dateRange = '30d', sections = ['all']) => {
 try {
   const exportData = {};
   
   const days = parseDateRange(dateRange);
   const endDate = new Date();
   const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
   const startDateStr = startDate.toISOString().split('T')[0];
   const endDateStr = endDate.toISOString().split('T')[0];

   if (sections.includes('all') || sections.includes('portfolio')) {
     exportData.portfolio = await getPortfolioMetrics(startDateStr, endDateStr);
   }
   
   if (sections.includes('all') || sections.includes('contacts')) {
     exportData.contacts = await getContactAnalytics(dateRange);
   }
   
   if (sections.includes('all') || sections.includes('admin')) {
     exportData.admin = await getAdminActivityAnalytics(dateRange);
   }
   
   if (sections.includes('all') || sections.includes('content')) {
     exportData.content = await getContentAnalytics(null, dateRange);
   }

   exportData.metadata = {
     exportDate: new Date().toISOString(),
     dateRange: { start: startDateStr, end: endDateStr },
     format,
     sections: sections.includes('all') ? ['portfolio', 'contacts', 'admin', 'content'] : sections
   };

   switch (format.toLowerCase()) {
     case 'csv':
       return { success: true, data: convertToCSV(exportData), filename: `analytics_${dateRange}_${Date.now()}.csv` };
     case 'json':
       return { success: true, data: JSON.stringify(exportData, null, 2), filename: `analytics_${dateRange}_${Date.now()}.json` };
     case 'pdf':
       return { success: false, error: 'PDF export not yet implemented' };
     default:
       return { success: true, data: exportData, filename: `analytics_${dateRange}_${Date.now()}.json` };
   }
 } catch (error) {
   console.error('Error exporting analytics data:', error);
   return { success: false, error: error.message };
 }
};

// ===== UTILITY FUNCTIONS =====

/**
* Generate unique session ID
*/
const generateSessionId = () => {
 return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
* Parse date range string to days
*/
const parseDateRange = (dateRange) => {
 switch (dateRange) {
   case '7d': return 7;
   case '30d': return 30;
   case '90d': return 90;
   case '1y': return 365;
   default: return 30;
 }
};

/**
* Get metric value from data object
*/
const getMetricValue = (dataItem, metricType) => {
 switch (metricType) {
   case 'portfolio_completeness':
     return dataItem.content_completeness_score || 0;
   case 'contact_volume':
     return dataItem.total_messages || 0;
   case 'admin_productivity':
     return dataItem.productivity_score || 0;
   default:
     return 0;
 }
};

/**
* Calculate daily trend from messages
*/
const calculateDailyTrend = (messages, days) => {
 const trend = [];
 const today = new Date();

 for (let i = days - 1; i >= 0; i--) {
   const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
   const dateStr = date.toISOString().split('T')[0];
   
   const dayMessages = messages.filter(msg => 
     msg.created_at.startsWith(dateStr)
   );

   trend.push({
     date: dateStr,
     count: dayMessages.length,
     day: date.toLocaleDateString('en-US', { weekday: 'short' })
   });
 }

 return trend;
};

/**
* Generate daily contact analytics
*/
const generateDailyContactAnalytics = async (dateStr) => {
 try {
   const { data: messages } = await supabase
     .from('contact_messages')
     .select('*')
     .gte('created_at', `${dateStr}T00:00:00`)
     .lt('created_at', `${dateStr}T23:59:59`);

   if (!messages || messages.length === 0) return;

   const contactTypes = { hr: 0, recruiter: 0, manager: 0, other: 0 };
   const subjects = [];
   const hours = {};

   messages.forEach(msg => {
     const type = msg.inquiry_type?.toLowerCase() || 'other';
     if (contactTypes.hasOwnProperty(type)) {
       contactTypes[type]++;
     } else {
       contactTypes.other++;
     }

     if (msg.subject) subjects.push(msg.subject);

     const hour = new Date(msg.created_at).getHours();
     hours[hour] = (hours[hour] || 0) + 1;
   });

   const peakHour = Object.keys(hours).reduce((a, b) => hours[a] > hours[b] ? a : b, 0);

   await supabase
     .from('contact_analytics')
     .upsert([
       {
         analysis_date: dateStr,
         total_messages: messages.length,
         hr_messages: contactTypes.hr,
         recruiter_messages: contactTypes.recruiter,
         manager_messages: contactTypes.manager,
         other_messages: contactTypes.other,
         peak_contact_hour: parseInt(peakHour),
         popular_subjects: subjects.slice(0, 10)
       }
     ]);
 } catch (error) {
   console.error('Error generating daily contact analytics:', error);
 }
};

/**
* Generate daily admin analytics
*/
const generateDailyAdminAnalytics = async (dateStr) => {
 try {
   const { data: sessions } = await supabase
     .from('admin_sessions')
     .select('*')
     .gte('start_time', `${dateStr}T00:00:00`)
     .lt('start_time', `${dateStr}T23:59:59`);

   if (!sessions || sessions.length === 0) return;

   const totalSessions = sessions.length;
   const totalTime = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
   const totalActions = sessions.reduce((sum, s) => sum + (s.actions_performed || 0), 0);

   const allSections = sessions.flatMap(s => s.sections_visited || []);
   const uniqueSections = [...new Set(allSections)];

   const sectionCounts = {};
   allSections.forEach(section => {
     sectionCounts[section] = (sectionCounts[section] || 0) + 1;
   });
   const mostUsedSection = Object.keys(sectionCounts).reduce((a, b) => 
     sectionCounts[a] > sectionCounts[b] ? a : b, null
   );

   const productivityScore = Math.min(100, Math.round(
     (totalActions / Math.max(totalTime, 1)) * 10 + (totalSessions * 2)
   ));

   await supabase
     .from('admin_activity_analytics')
     .upsert([
       {
         activity_date: dateStr,
         total_sessions: totalSessions,
         total_active_time_minutes: totalTime,
         sections_visited: uniqueSections.length,
         content_updates: totalActions,
         most_used_section: mostUsedSection,
         productivity_score: productivityScore
       }
     ]);
 } catch (error) {
   console.error('Error generating daily admin analytics:', error);
 }
};

/**
* Update admin activity analytics in real-time
*/
const updateAdminActivityAnalytics = async (sessionDate, duration, sectionsCount, actions) => {
 try {
   const dateStr = sessionDate.toISOString().split('T')[0];
   
   const { data: existing } = await supabase
     .from('admin_activity_analytics')
     .select('*')
     .eq('activity_date', dateStr)
     .single();

   if (existing) {
     const newTotalSessions = existing.total_sessions + 1;
     const newTotalTime = existing.total_active_time_minutes + duration;
     const newTotalActions = existing.content_updates + actions;
     const newProductivityScore = Math.min(100, Math.round(
       (newTotalActions / Math.max(newTotalTime, 1)) * 10 + (newTotalSessions * 2)
     ));

     await supabase
       .from('admin_activity_analytics')
       .update({
         total_sessions: newTotalSessions,
         total_active_time_minutes: newTotalTime,
         sections_visited: Math.max(existing.sections_visited, sectionsCount),
         content_updates: newTotalActions,
         productivity_score: newProductivityScore
       })
       .eq('id', existing.id);
   } else {
     const productivityScore = Math.min(100, Math.round(
       (actions / Math.max(duration, 1)) * 10 + 2
     ));

     await supabase
       .from('admin_activity_analytics')
       .insert([
         {
           activity_date: dateStr,
           total_sessions: 1,
           total_active_time_minutes: duration,
           sections_visited: sectionsCount,
           content_updates: actions,
           productivity_score: productivityScore
         }
       ]);
   }
 } catch (error) {
   console.error('Error updating admin activity analytics:', error);
 }
};

// ===== HELPER FUNCTIONS =====

// Helper function to calculate views change
const calculateViewsChange = (data) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const todayViews = data
      .filter(item => item.performance_date === today)
      .reduce((sum, item) => sum + (item.view_count || 0), 0);
    
    const yesterdayViews = data
      .filter(item => item.performance_date === yesterday)
      .reduce((sum, item) => sum + (item.view_count || 0), 0);
    
    if (yesterdayViews === 0) return todayViews > 0 ? 100 : 0;
    
    return Math.round(((todayViews - yesterdayViews) / yesterdayViews) * 100 * 10) / 10;
  } catch (error) {
    return 0;
  }
};

// Helper function to calculate engagement change
const calculateEngagementChange = (data) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const todayData = data.filter(item => item.performance_date === today);
    const yesterdayData = data.filter(item => item.performance_date === yesterday);
    
    const todayAvg = todayData.length > 0 
      ? todayData.reduce((sum, item) => sum + (item.engagement_score || 0), 0) / todayData.length 
      : 0;
    
    const yesterdayAvg = yesterdayData.length > 0 
      ? yesterdayData.reduce((sum, item) => sum + (item.engagement_score || 0), 0) / yesterdayData.length 
      : 0;
    
    if (yesterdayAvg === 0) return todayAvg > 0 ? 100 : 0;
    
    return Math.round(((todayAvg - yesterdayAvg) / yesterdayAvg) * 100 * 10) / 10;
  } catch (error) {
    return 0;
  }
};

/**
* Calculate period averages for portfolio metrics
*/
const calculatePeriodAverages = (metrics) => {
 if (!metrics || metrics.length === 0) {
   return {
     total_projects: 0,
     total_skills: 0,
     total_certifications: 0,
     content_completeness_score: 0
   };
 }

 const totals = metrics.reduce((acc, metric) => {
   Object.keys(metric).forEach(key => {
     if (typeof metric[key] === 'number' && key !== 'id') {
       acc[key] = (acc[key] || 0) + metric[key];
     }
   });
   return acc;
 }, {});

 const averages = {};
 Object.keys(totals).forEach(key => {
   averages[key] = Math.round((totals[key] / metrics.length) * 100) / 100;
 });

 return averages;
};

/**
* Calculate linear forecast for next period
*/
const calculateLinearForecast = (values) => {
 if (values.length < 2) return values[0] || 0;

 const n = values.length;
 const x = Array.from({ length: n }, (_, i) => i);
 const y = values;

 const sumX = x.reduce((sum, val) => sum + val, 0);
 const sumY = y.reduce((sum, val) => sum + val, 0);
 const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
 const sumX2 = x.reduce((sum, val) => sum + val * val, 0);

 const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
 const intercept = (sumY - slope * sumX) / n;

 return Math.round((slope * n + intercept) * 100) / 100;
};

/**
* Generate insights based on trend patterns
*/
const generateTrendInsights = (patterns, trend, forecast) => {
 const insights = [];

 if (patterns.includes('consistent_growth')) {
   insights.push('Metrics show consistent improvement over time');
 }
 
 if (patterns.includes('consistent_decline')) {
   insights.push('Metrics show concerning decline - review strategy');
 }
 
 if (patterns.includes('high_volatility')) {
   insights.push('High volatility detected - consider stabilization measures');
 }
 
 if (patterns.includes('stable')) {
   insights.push('Metrics are stable with minimal fluctuation');
 }

 if (trend === 'increasing' && forecast) {
   insights.push(`Positive trend continues - forecast suggests further improvement to ${forecast}`);
 } else if (trend === 'decreasing' && forecast) {
   insights.push(`Declining trend continues - forecast predicts drop to ${forecast}`);
 }

 return insights.length > 0 ? insights : ['No significant patterns detected in current data'];
};

/**
* Convert data object to CSV format
*/
const convertToCSV = (data) => {
 if (data.portfolio && Array.isArray(data.portfolio)) {
   const headers = Object.keys(data.portfolio[0] || {});
   const csvRows = [headers.join(',')];
   
   data.portfolio.forEach(row => {
     const values = headers.map(header => row[header] || '');
     csvRows.push(values.join(','));
   });
   
   return csvRows.join('\n');
 }
 
 return JSON.stringify(data, null, 2);
};

// ===== REAL-TIME TRACKING HELPERS =====

/**
* Start tracking admin session
*/
export const startAdminSession = () => {
 const sessionId = generateSessionId();
 const startTime = new Date();
 
 return {
   sessionId,
   startTime,
   sectionsVisited: [],
   actionsPerformed: 0,
   
   visitSection: function(sectionId) {
     if (!this.sectionsVisited.includes(sectionId)) {
       this.sectionsVisited.push(sectionId);
     }
     trackEvent('section_visit', 'admin', 'visit_section', sectionId, 1, {}, 'admin', this.sessionId);
   },
   
   performAction: function(actionType, details = {}) {
     this.actionsPerformed++;
     trackEvent('admin_action', 'admin', actionType, null, 1, details, 'admin', this.sessionId);
   },
   
   endSession: async function() {
     const endTime = new Date();
     await trackAdminSession(this.startTime, endTime, this.sectionsVisited, this.actionsPerformed);
     return {
       duration: endTime - this.startTime,
       sectionsVisited: this.sectionsVisited.length,
       actionsPerformed: this.actionsPerformed
     };
   }
 };
};

// Export all functions for use in components
const analyticsService = {
 // Core tracking
 trackEvent,
 trackContentView,
 trackAdminSession,
 trackContentUpdate,
 
 // Metrics calculation
 calculatePortfolioCompleteness,
 calculateContentEngagement,
 calculateAdminProductivity,
 calculateContactTrends,
 
 // Data retrieval
 getPortfolioMetrics,
 getContentAnalytics,
 getContactAnalytics,
 getAdminActivityAnalytics,
 getTrendAnalysis,
 
 // Aggregation
 generateDailyMetrics,
 generateWeeklyReport,
 generateMonthlyReport,
 
 // Comparison and analysis
 comparePerformancePeriods,
 benchmarkMetrics,
 identifyTrends,
 detectAnomalies,

 // Content analytics specific functions
 getSectionPerformance,
 getTopPerformingContent,
 getContentEngagementHistory,
 getSectionCompleteness,
 
 // Export
 exportAnalyticsData,
 
 // Real-time tracking
 startAdminSession
};

export default analyticsService;