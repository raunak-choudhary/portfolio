// src/components/admin/Analytics/PortfolioMetrics.js
import React, { useState, useEffect, useCallback } from 'react';
import analyticsService from '../../../services/analyticsService';
import MetricsCard from './MetricsCard';
import './PortfolioMetrics.css';

const PortfolioMetrics = ({ dateRange = '30d' }) => {
  const [portfolioData, setPortfolioData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState([]);
  const [sectionProgress, setSectionProgress] = useState([]);
  const [error, setError] = useState(null);

  // Parse date range helper - wrapped in useCallback to prevent useEffect dependency warning
  const parseDateRange = useCallback((range) => {
    switch (range) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      default: return 30;
    }
  }, []);

  // Calculate section completeness from real data
  const calculateSectionCompleteness = useCallback(async () => {
    try {
      // This will fetch real content data from the database
      const sectionStatus = await analyticsService.getSectionCompleteness();
      
      if (!sectionStatus || sectionStatus.length === 0) {
        // Return empty state if no data available
        return [];
      }

      return sectionStatus.map(section => ({
        name: section.name,
        weight: section.weight,
        completeness: section.completeness,
        hasContent: section.completeness > 0
      }));
    } catch (error) {
      console.error('Error calculating section completeness:', error);
      return [];
    }
  }, []);

  // Calculate trend change from historical data
  const calculateTrendChange = useCallback((trendData) => {
    if (!trendData || !Array.isArray(trendData) || trendData.length < 2) {
      return 0;
    }

    const current = trendData[trendData.length - 1]?.value || 0;
    const previous = trendData[trendData.length - 2]?.value || 0;

    if (previous === 0) return current > 0 ? 100 : 0;
    
    return Math.round(((current - previous) / previous) * 100 * 10) / 10;
  }, []);

  // Get trend type based on change value
  const getTrendType = useCallback((change) => {
    if (change > 0) return 'positive';
    if (change < 0) return 'negative';
    return 'neutral';
  }, []);

  // Process portfolio metrics for display - no dummy data
  const processPortfolioMetrics = useCallback((portfolioMetrics, contentEngagement, sectionCompleteness) => {
    const totalSections = sectionCompleteness.length;
    const completedSections = sectionCompleteness.filter(s => s.completeness > 0).length;
    
    // Get real counts from analytics data
    const totalProjects = portfolioMetrics?.total_projects || 0;
    const totalSkills = portfolioMetrics?.total_skills || 0;
    const totalCertifications = portfolioMetrics?.total_certifications || 0;

    // Calculate trends from historical data
    const projectTrend = calculateTrendChange(portfolioMetrics?.project_trend);
    const skillsTrend = calculateTrendChange(portfolioMetrics?.skills_trend);
    const certificationsTrend = calculateTrendChange(portfolioMetrics?.certifications_trend);
    const completionTrend = calculateTrendChange(portfolioMetrics?.completion_trend);

    return [
      {
        title: 'Total Projects',
        value: totalProjects,
        icon: '💼',
        color: 'blue',
        change: projectTrend,
        changeType: getTrendType(projectTrend),
        description: 'Projects in portfolio'
      },
      {
        title: 'Skills Listed',
        value: totalSkills,
        icon: '🛠️',
        color: 'emerald',
        change: skillsTrend,
        changeType: getTrendType(skillsTrend),
        description: 'Technical and soft skills'
      },
      {
        title: 'Certifications',
        value: totalCertifications,
        icon: '🏆',
        color: 'orange',
        change: certificationsTrend,
        changeType: getTrendType(certificationsTrend),
        description: 'Professional certifications'
      },
      {
        title: 'Sections Complete',
        value: totalSections > 0 ? `${completedSections}/${totalSections}` : '0/0',
        icon: '✅',
        color: 'purple',
        change: completionTrend,
        changeType: getTrendType(completionTrend),
        description: 'Portfolio section completion'
      }
    ];
  }, [calculateTrendChange, getTrendType]);

  // Load portfolio metrics data
  const loadPortfolioData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [
        completenessScore,
        portfolioMetrics,
        contentEngagement,
        sectionCompleteness
      ] = await Promise.all([
        analyticsService.calculatePortfolioCompleteness(),
        analyticsService.getPortfolioMetrics(),
        analyticsService.calculateContentEngagement(null, parseDateRange(dateRange)),
        calculateSectionCompleteness()
      ]);

      setPortfolioData({
        completenessScore: completenessScore || 0,
        portfolioMetrics: portfolioMetrics || [],
        contentEngagement: contentEngagement || [],
        lastUpdated: new Date()
      });

      setSectionProgress(sectionCompleteness);

      // Process metrics for cards
      const processedMetrics = processPortfolioMetrics(
        portfolioMetrics?.[0] || {}, 
        contentEngagement, 
        sectionCompleteness
      );
      setMetrics(processedMetrics);

    } catch (error) {
      console.error('Error loading portfolio data:', error);
      setError('Failed to load portfolio metrics. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, parseDateRange, calculateSectionCompleteness, processPortfolioMetrics]);

  // Load data when component mounts or dateRange changes
  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Calculate overall progress percentage
  const calculateOverallProgress = useCallback(() => {
    if (sectionProgress.length === 0) return 0;
    
    const totalWeight = sectionProgress.reduce((sum, section) => sum + (section.weight || 0), 0);
    const completedWeight = sectionProgress.reduce((sum, section) => {
      return sum + ((section.completeness || 0) / 100) * (section.weight || 0);
    }, 0);
    
    if (totalWeight === 0) return 0;
    
    return Math.round((completedWeight / totalWeight) * 100);
  }, [sectionProgress]);

  const overallProgress = calculateOverallProgress();

  // Handle retry when error occurs
  const handleRetry = useCallback(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Error state
  if (error) {
    return (
      <div className="portfolio-metrics portfolio-metrics--error">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3 className="error-title">Unable to Load Portfolio Metrics</h3>
          <p className="error-message">{error}</p>
          <button onClick={handleRetry} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="portfolio-metrics">
      {/* Header Section */}
      <div className="portfolio-metrics-header">
        <h2 className="portfolio-metrics-title">
          <span className="metrics-icon">📈</span>
          Portfolio Performance Metrics
        </h2>
        <p className="portfolio-metrics-subtitle">
          Comprehensive analysis of your portfolio completeness and content effectiveness
        </p>
      </div>

      {/* Overall Completeness Score */}
      <div className="completeness-overview">
        <div className="completeness-card">
          <div className="completeness-content">
            <h3 className="completeness-title">Overall Portfolio Completeness</h3>
            <div className="completeness-score">
              <span className="score-value">
                {isLoading ? '...' : `${portfolioData.completenessScore || overallProgress}%`}
              </span>
              <div className="score-progress">
                <div 
                  className="score-progress-fill"
                  style={{ 
                    width: isLoading ? '0%' : `${portfolioData.completenessScore || overallProgress}%`,
                    transition: 'width 0.5s ease-in-out'
                  }}
                ></div>
              </div>
            </div>
            <p className="completeness-description">
              Based on content quality, section completion, and engagement metrics
            </p>
          </div>
          <div className="completeness-visual">
            <div className="circular-progress">
              <svg viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - (portfolioData.completenessScore || overallProgress) / 100)}`}
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--neon-cyan)" />
                    <stop offset="50%" stopColor="var(--neon-purple)" />
                    <stop offset="100%" stopColor="var(--neon-pink)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="progress-percentage">
                {isLoading ? '...' : `${portfolioData.completenessScore || overallProgress}%`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="portfolio-metrics-grid">
        {metrics.map((metric, index) => (
          <MetricsCard
            key={`metric-${index}`}
            title={metric.title}
            value={metric.value}
            icon={metric.icon}
            color={metric.color}
            change={metric.change}
            changeType={metric.changeType}
            description={metric.description}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Section Progress Breakdown */}
      {sectionProgress.length > 0 && (
        <div className="section-progress">
          <h3 className="section-progress-title">Section Completion Breakdown</h3>
          <div className="section-progress-grid">
            {sectionProgress.map((section, index) => (
              <div key={`section-${index}`} className="section-item">
                <div className="section-header">
                  <span className="section-name">{section.name}</span>
                  <span className="section-percentage">{section.completeness || 0}%</span>
                </div>
                <div className="section-progress-bar">
                  <div 
                    className={`section-progress-fill ${
                      (section.completeness || 0) === 100 ? 'complete' : 
                      (section.completeness || 0) > 0 ? 'partial' : 'empty'
                    }`}
                    style={{ 
                      width: `${section.completeness || 0}%`,
                      transition: 'width 0.3s ease-in-out'
                    }}
                  ></div>
                </div>
                <div className="section-weight">Weight: {section.weight || 0}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Engagement Summary */}
      {portfolioData.contentEngagement && portfolioData.contentEngagement.length > 0 && (
        <div className="engagement-summary">
          <h3 className="engagement-title">Content Engagement Overview</h3>
          <div className="engagement-grid">
            {portfolioData.contentEngagement.slice(0, 6).map((content, index) => (
              <div key={`engagement-${index}`} className="engagement-item">
                <div className="engagement-type">{content.content_type}</div>
                <div className="engagement-stats">
                  <span className="stat-views">{content.total_views || 0} views</span>
                  <span className="stat-score">Score: {content.avg_engagement || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Growth Timeline */}
      <div className="growth-timeline">
        <h3 className="timeline-title">Portfolio Growth Timeline</h3>
        <div className="timeline-content">
          {isLoading ? (
            <p className="timeline-description">Loading portfolio growth data...</p>
          ) : portfolioData.portfolioMetrics && portfolioData.portfolioMetrics.length > 0 ? (
            <p className="timeline-description">
              Your portfolio has grown significantly over the past {dateRange}. 
              Latest metrics show {portfolioData.portfolioMetrics.length} data points recorded.
            </p>
          ) : (
            <p className="timeline-description">
              No growth data available for the selected period. Continue adding content to see detailed growth analytics.
            </p>
          )}
          
          {portfolioData.lastUpdated && (
            <p className="timeline-updated">
              Last updated: {portfolioData.lastUpdated.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Empty State */}
      {!isLoading && metrics.every(m => m.value === 0) && sectionProgress.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3 className="empty-title">No Portfolio Data Available</h3>
          <p className="empty-description">
            Start adding content to your portfolio to see detailed metrics and analytics.
          </p>
        </div>
      )}
    </div>
  );
};

export default PortfolioMetrics;