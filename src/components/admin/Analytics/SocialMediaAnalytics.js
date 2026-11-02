// =====================================================
// 1. CREATE: src/components/admin/Analytics/SocialMediaAnalytics.js
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabaseClient';
import MetricsCard from './MetricsCard';
import './SocialMediaAnalytics.css';

const SocialMediaAnalytics = ({ selectedPeriod = 30 }) => {

  const fetchSocialMediaData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - selectedPeriod);

      // Fetch social media click events
      const { data: socialClicks, error: clicksError } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('event_action', 'click_social_media')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (clicksError) throw clicksError;

      // Process social media data
      const processedData = processSocialMediaData(socialClicks || []);
      setSocialData(processedData);

    } catch (error) {
      console.error('Error fetching social media analytics:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  const [socialData, setSocialData] = useState({
    totalSocialClicks: 0,
    platformBreakdown: {},
    dailyTrends: [],
    topPlatform: null,
    conversionRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSocialMediaData();
  }, [selectedPeriod, fetchSocialMediaData]);

  const processSocialMediaData = (clicks) => {
    const platformBreakdown = {};
    const dailyData = {};
    
    clicks.forEach(click => {
      const platform = click.event_label; // linkedin, github, instagram
      const date = new Date(click.created_at).toISOString().split('T')[0];
      
      // Platform breakdown
      platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;
      
      // Daily trends
      if (!dailyData[date]) {
        dailyData[date] = {};
      }
      dailyData[date][platform] = (dailyData[date][platform] || 0) + 1;
    });

    // Convert daily data to array for charts
    const dailyTrends = Object.entries(dailyData).map(([date, platforms]) => ({
      date,
      ...platforms,
      total: Object.values(platforms).reduce((sum, count) => sum + count, 0)
    }));

    // Find top platform
    const topPlatform = Object.entries(platformBreakdown)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

    return {
      totalSocialClicks: clicks.length,
      platformBreakdown,
      dailyTrends,
      topPlatform,
      conversionRate: calculateConversionRate(clicks.length, selectedPeriod)
    };
  };

  const calculateConversionRate = (socialClicks, totalDays) => {
    // Simple conversion rate: social clicks per day
    return totalDays > 0 ? (socialClicks / totalDays).toFixed(1) : 0;
  };

  const getPlatformIcon = (platform) => {
    const icons = {
      linkedin: '💼',
      github: '👨‍💻',
      instagram: '📸'
    };
    return icons[platform] || '🔗';
  };

  const getPlatformDisplayName = (platform) => {
    const names = {
      linkedin: 'LinkedIn',
      github: 'GitHub', 
      instagram: 'Instagram'
    };
    return names[platform] || platform;
  };

  if (loading) {
    return (
      <div className="social-media-analytics loading">
        <div className="loading-spinner"></div>
        <p>Loading social media analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="social-media-analytics error">
        <h3>Social Media Analytics</h3>
        <p className="error-message">Error loading data: {error}</p>
      </div>
    );
  }

  return (
    <div className="social-media-analytics">
      <div className="section-header">
        <h3>🌐 Social Media Engagement</h3>
        <p>Track which platforms drive the most professional connections</p>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <MetricsCard
          title="Total Social Clicks"
          value={socialData.totalSocialClicks}
          subtitle={`Last ${selectedPeriod} days`}
          trend="up"
          icon="🔗"
        />
        
        <MetricsCard
          title="Top Platform"
          value={socialData.topPlatform ? getPlatformDisplayName(socialData.topPlatform) : 'N/A'}
          subtitle={socialData.topPlatform ? `${socialData.platformBreakdown[socialData.topPlatform]} clicks` : 'No data'}
          icon={socialData.topPlatform ? getPlatformIcon(socialData.topPlatform) : '📊'}
        />
        
        <MetricsCard
          title="Daily Average"
          value={socialData.conversionRate}
          subtitle="Clicks per day"
          icon="📈"
        />
        
        <MetricsCard
          title="Platforms Active"
          value={Object.keys(socialData.platformBreakdown).length}
          subtitle="Social platforms clicked"
          icon="🎯"
        />
      </div>

      {/* Platform Breakdown */}
      <div className="platform-breakdown">
        <h4>Platform Performance</h4>
        <div className="platform-stats">
          {Object.entries(socialData.platformBreakdown)
            .sort(([,a], [,b]) => b - a)
            .map(([platform, clicks]) => {
              const percentage = socialData.totalSocialClicks > 0 
                ? ((clicks / socialData.totalSocialClicks) * 100).toFixed(1)
                : 0;
              
              return (
                <div key={platform} className="platform-stat">
                  <div className="platform-info">
                    <span className="platform-icon">{getPlatformIcon(platform)}</span>
                    <span className="platform-name">{getPlatformDisplayName(platform)}</span>
                  </div>
                  <div className="platform-metrics">
                    <span className="clicks-count">{clicks} clicks</span>
                    <span className="percentage">({percentage}%)</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Social Media Insights */}
      <div className="social-insights">
        <h4>🎯 Professional Insights</h4>
        <div className="insights-grid">
          <div className="insight-card">
            <h5>💼 LinkedIn Performance</h5>
            <p>
              {socialData.platformBreakdown.linkedin || 0} professional connections initiated.
              {socialData.platformBreakdown.linkedin > socialData.platformBreakdown.github ? 
                " Great professional engagement!" : 
                " Consider optimizing LinkedIn presence."}
            </p>
          </div>
          
          <div className="insight-card">
            <h5>👨‍💻 GitHub Activity</h5>
            <p>
              {socialData.platformBreakdown.github || 0} developers checked your code.
              {socialData.platformBreakdown.github > 10 ? 
                " Strong technical interest!" : 
                " Showcase more projects to attract developers."}
            </p>
          </div>
          
          <div className="insight-card">
            <h5>📊 Overall Engagement</h5>
            <p>
              {socialData.totalSocialClicks > 20 ? 
                "Excellent social media engagement! Your portfolio is attracting attention." :
                socialData.totalSocialClicks > 5 ?
                "Good social engagement. Consider promoting your portfolio more." :
                "Increase social media presence to drive more traffic."}
            </p>
          </div>
        </div>
      </div>

      {/* No Data State */}
      {socialData.totalSocialClicks === 0 && (
        <div className="no-data-state">
          <div className="no-data-icon">🌐</div>
          <h4>No Social Media Clicks Yet</h4>
          <p>Social media engagement data will appear here once visitors start clicking your social links.</p>
          <div className="no-data-tips">
            <h5>Tips to increase social engagement:</h5>
            <ul>
              <li>Promote your portfolio on LinkedIn</li>
              <li>Share interesting projects on GitHub</li>
              <li>Add social media CTAs to your content</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialMediaAnalytics;