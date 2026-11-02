// src/components/admin/Analytics/ContentAnalytics.js - PRODUCTION VERSION
import React, { useState, useEffect, useCallback } from 'react';
import analyticsService from '../../../services/analyticsService';
import MetricsCard from './MetricsCard';
import './ContentAnalytics.css';

const ContentAnalytics = ({ dateRange = '30d' }) => {
  const [contentData, setContentData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [contentMetrics, setContentMetrics] = useState([]);
  const [sectionPerformance, setSectionPerformance] = useState([]);
  const [topContent, setTopContent] = useState([]);
  const [contentEngagement, setContentEngagement] = useState([]);
  const [performanceInsights, setPerformanceInsights] = useState([]);
  const [error, setError] = useState(null);

  // Parse date range helper
  const parseDateRange = useCallback((range) => {
    switch (range) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      default: return 30;
    }
  }, []);

  // Get trend type
  const getTrendType = useCallback((change) => {
    if (change > 5) return 'positive';
    if (change < -5) return 'negative';
    return 'neutral';
  }, []);

  // Process content metrics for display
  const processContentMetrics = useCallback((contentAnalytics) => {
    if (!contentAnalytics) return [];

    const {
      totalViews = 0,
      avgEngagementScore = 0,
      contentCompleteness = 0,
      activeContent = 0,
      popularContent = 0,
      engagementRate = 0
    } = contentAnalytics;

    return [
      {
        title: 'Total Content Views',
        value: totalViews,
        icon: '👀',
        color: 'blue',
        change: contentAnalytics.viewsChange || 0,
        changeType: getTrendType(contentAnalytics.viewsChange || 0),
        description: `Content views in ${dateRange}`
      },
      {
        title: 'Avg Engagement Score',
        value: avgEngagementScore.toFixed(1),
        suffix: '/10',
        icon: '⭐',
        color: 'purple',
        change: contentAnalytics.engagementChange || 0,
        changeType: getTrendType(contentAnalytics.engagementChange || 0),
        description: 'Average content engagement rating'
      },
      {
        title: 'Content Completeness',
        value: contentCompleteness,
        suffix: '%',
        icon: '📊',
        color: 'emerald',
        change: contentAnalytics.completenessChange || 0,
        changeType: getTrendType(contentAnalytics.completenessChange || 0),
        description: 'Overall portfolio completeness'
      },
      {
        title: 'Active Content Pieces',
        value: activeContent,
        icon: '📝',
        color: 'orange',
        change: contentAnalytics.activeContentChange || 0,
        changeType: getTrendType(contentAnalytics.activeContentChange || 0),
        description: 'Published content items'
      },
      {
        title: 'Popular Content',
        value: popularContent,
        icon: '🔥',
        color: 'pink',
        change: contentAnalytics.popularContentChange || 0,
        changeType: getTrendType(contentAnalytics.popularContentChange || 0),
        description: 'High-performing content pieces'
      },
      {
        title: 'Engagement Rate',
        value: engagementRate.toFixed(1),
        suffix: '%',
        icon: '💫',
        color: 'blue',
        change: contentAnalytics.engagementRateChange || 0,
        changeType: getTrendType(contentAnalytics.engagementRateChange || 0),
        description: 'Content interaction rate'
      }
    ];
  }, [dateRange, getTrendType]);

  // Calculate overall performance score
  const calculatePerformanceScore = useCallback((section) => {
    if (!section.views && !section.engagement && !section.completeness) return 0;
    
    const viewsWeight = 0.4;
    const engagementWeight = 0.3;
    const completenessWeight = 0.3;
    
    const maxViews = Math.max(...sectionPerformance.map(s => s.views || 0));
    const viewsScore = maxViews > 0 ? (section.views / maxViews) * 100 : 0;
    const engagementScore = (section.engagement / 10) * 100;
    const completenessScore = section.completeness || 0;
    
    return Math.round(
      (viewsScore * viewsWeight) + 
      (engagementScore * engagementWeight) + 
      (completenessScore * completenessWeight)
    );
  }, [sectionPerformance]);

  // Process content engagement insights
  const processPerformanceInsights = useCallback((contentAnalytics, sectionData, topContentData) => {
    const insights = [];

    if (!contentAnalytics) return insights;

    // High engagement insight
    if (contentAnalytics.avgEngagementScore >= 8.0) {
      insights.push({
        type: 'success',
        icon: '🎉',
        title: 'Excellent Content Engagement',
        message: `Your content maintains a high engagement score of ${contentAnalytics.avgEngagementScore.toFixed(1)}/10.`
      });
    } else if (contentAnalytics.avgEngagementScore < 6.0) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Engagement Opportunity',
        message: 'Consider updating content to improve engagement scores across sections.'
      });
    }

    // Content completeness insight
    if (contentAnalytics.contentCompleteness >= 90) {
      insights.push({
        type: 'success',
        icon: '✅',
        title: 'Portfolio Nearly Complete',
        message: `Your portfolio is ${contentAnalytics.contentCompleteness}% complete. Excellent work!`
      });
    } else if (contentAnalytics.contentCompleteness < 70) {
      insights.push({
        type: 'info',
        icon: '📝',
        title: 'Content Completion Opportunity',
        message: 'Adding more content to incomplete sections could improve overall performance.'
      });
    }

    // Top performing section insight
    if (sectionData && sectionData.length > 0) {
      const topSection = sectionData[0];
      insights.push({
        type: 'info',
        icon: '🏆',
        title: 'Top Performing Section',
        message: `${topSection.section} is your highest performing section with ${topSection.views} views.`
      });
    }

    // Views trend insight
    if (contentAnalytics.viewsChange > 20) {
      insights.push({
        type: 'success',
        icon: '📈',
        title: 'Growing Viewership',
        message: `Content views increased by ${contentAnalytics.viewsChange.toFixed(1)}% in this period.`
      });
    } else if (contentAnalytics.viewsChange < -10) {
      insights.push({
        type: 'warning',
        icon: '📉',
        title: 'Declining Views',
        message: 'Consider refreshing content or adding new material to boost engagement.'
      });
    }

    return insights;
  }, []);

  // Load content analytics data
  const loadContentData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [
        contentAnalytics,
        sectionData,
        topContentData,
        engagementData
      ] = await Promise.all([
        analyticsService.calculateContentEngagement(null, parseDateRange(dateRange)),
        analyticsService.getSectionPerformance(dateRange),
        analyticsService.getTopPerformingContent(dateRange),
        analyticsService.getContentEngagementHistory(dateRange)
      ]);

      setContentData({
        ...contentAnalytics,
        lastUpdated: new Date()
      });

      // Process metrics
      const processedMetrics = processContentMetrics(contentAnalytics);
      setContentMetrics(processedMetrics);

      // Process section performance with calculated scores
      const processedSections = (sectionData || []).map(section => ({
        ...section,
        performance: calculatePerformanceScore(section)
      })).sort((a, b) => b.performance - a.performance);
      setSectionPerformance(processedSections);

      // Set top content
      setTopContent((topContentData || []).sort((a, b) => (b.views || 0) - (a.views || 0)));

      // Set engagement data
      setContentEngagement(engagementData || []);

      // Generate insights
      const insights = processPerformanceInsights(contentAnalytics, processedSections, topContentData);
      setPerformanceInsights(insights);

    } catch (error) {
      console.error('Error loading content analytics:', error);
      setError('Failed to load content analytics data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [
    dateRange,
    parseDateRange,
    processContentMetrics,
    calculatePerformanceScore,
    processPerformanceInsights
  ]);

  // Load data when component mounts or dateRange changes
  useEffect(() => {
    loadContentData();
  }, [dateRange]);

  // Render loading state
  if (isLoading) {
    return (
      <div className="content-analytics loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading content analytics...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="content-analytics error">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h3>Unable to Load Content Analytics</h3>
          <p>{error}</p>
          <button onClick={loadContentData} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Render empty state if no data
  if (!contentData || Object.keys(contentData).length === 0) {
    return (
      <div className="content-analytics empty">
        <div className="empty-container">
          <div className="empty-icon">📊</div>
          <h3>No Content Analytics Available</h3>
          <p>Content analytics data will appear here once you have portfolio content and visitor interactions.</p>
          <button onClick={loadContentData} className="refresh-button">
            Refresh Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-analytics">
      {/* Header */}
      <div className="content-analytics-header">
        <h2 className="content-analytics-title">
          <span className="analytics-icon">📊</span>
          Content Performance Analytics
        </h2>
        <p className="content-analytics-subtitle">
          Detailed analysis of your portfolio content engagement, performance, and optimization opportunities
        </p>
      </div>

      {/* Content Metrics Grid */}
      <div className="content-metrics-grid">
        {contentMetrics.map((metric, index) => (
          <MetricsCard
            key={index}
            title={metric.title}
            value={metric.value}
            suffix={metric.suffix}
            icon={metric.icon}
            color={metric.color}
            change={metric.change}
            changeType={metric.changeType}
            description={metric.description}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Section Performance Analysis */}
      {sectionPerformance.length > 0 && (
        <div className="section-performance-analysis">
          <h3 className="performance-title">Section Performance Ranking</h3>
          <div className="performance-grid">
            {sectionPerformance.map((section, index) => (
              <div key={index} className="performance-item">
                <div className="performance-rank">#{index + 1}</div>
                <div className="performance-content">
                  <div className="section-name">{section.section}</div>
                  <div className="performance-stats">
                    <span className="stat-views">{section.views || 0} views</span>
                    <span className="stat-engagement">{(section.engagement || 0).toFixed(1)}/10 engagement</span>
                    <span className="stat-completeness">{section.completeness || 0}% complete</span>
                  </div>
                  <div className="performance-score">
                    Score: {section.performance || 0}/100
                  </div>
                </div>
                <div className="performance-bar">
                  <div 
                    className="performance-bar-fill"
                    style={{ width: `${section.performance || 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Performing Content */}
      {topContent.length > 0 && (
        <div className="top-content-section">
          <h3 className="top-content-title">Top Performing Content</h3>
          <div className="top-content-grid">
            {topContent.slice(0, 8).map((content, index) => (
              <div key={index} className="content-item">
                <div className="content-rank">#{index + 1}</div>
                <div className="content-details">
                  <div className="content-title">{content.title}</div>
                  <div className="content-meta">
                    <span className="content-type">{content.type}</span>
                    <span className="content-section">{content.section}</span>
                  </div>
                  <div className="content-stats">
                    <span className="content-views">{content.views || 0} views</span>
                    <span className="content-engagement">{(content.engagement || 0).toFixed(1)} rating</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Engagement Timeline */}
      {contentEngagement.length > 0 && (
        <div className="engagement-timeline-section">
          <h3 className="timeline-title">Content Engagement Over Time</h3>
          <div className="engagement-chart">
            {contentEngagement.map((data, index) => (
              <div key={index} className="engagement-day">
                <div 
                  className="engagement-bar"
                  style={{ 
                    height: `${Math.max(10, (data.engagement / Math.max(...contentEngagement.map(d => d.engagement))) * 100)}%`
                  }}
                  title={`${data.date}: ${data.engagement} engagement`}
                ></div>
                <div className="engagement-label">{data.date}</div>
                <div className="engagement-value">{data.engagement}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Insights */}
      {performanceInsights.length > 0 && (
        <div className="performance-insights-section">
          <h3 className="insights-title">Performance Insights & Recommendations</h3>
          <div className="insights-grid">
            {performanceInsights.map((insight, index) => (
              <div key={index} className={`insight-card insight-card--${insight.type}`}>
                <div className="insight-icon">{insight.icon}</div>
                <div className="insight-content">
                  <h4 className="insight-title">{insight.title}</h4>
                  <p className="insight-message">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Updated */}
      {contentData.lastUpdated && (
        <div className="content-analytics-footer">
          <span className="last-updated">
            Content analytics last updated: {contentData.lastUpdated.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default ContentAnalytics;