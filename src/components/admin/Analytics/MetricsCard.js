// src/components/admin/Analytics/MetricsCard.js
import React from 'react';
import './MetricsCard.css';

const MetricsCard = ({ 
  title, 
  value, 
  change, 
  changeType = 'neutral', 
  icon, 
  description, 
  trend = [], 
  color = 'blue',
  isLoading = false,
  onClick = null,
  size = 'medium',
  showTrend = false
}) => {
  const formatValue = (val) => {
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toLocaleString();
    }
    return val;
  };

  const formatChange = (changeVal) => {
    if (!changeVal && changeVal !== 0) return null;
    const sign = changeVal > 0 ? '+' : '';
    return `${sign}${changeVal.toFixed(1)}%`;
  };

  const renderSparkline = () => {
    if (!showTrend || !trend || trend.length < 2) return null;

    const max = Math.max(...trend);
    const min = Math.min(...trend);
    const range = max - min || 1;

    const points = trend.map((value, index) => {
      const x = (index / (trend.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="metrics-card-sparkline">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={`metrics-card metrics-card--${size} metrics-card--loading`}>
        <div className="metrics-card-skeleton">
          <div className="skeleton-title"></div>
          <div className="skeleton-value"></div>
          <div className="skeleton-change"></div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`metrics-card metrics-card--${size} metrics-card--${color} ${onClick ? 'metrics-card--clickable' : ''}`}
      onClick={onClick}
    >
      <div className="metrics-card-header">
        {icon && <div className="metrics-card-icon">{icon}</div>}
        <h3 className="metrics-card-title">{title}</h3>
      </div>

      <div className="metrics-card-content">
        <div className="metrics-card-value">
          {formatValue(value)}
        </div>

        {change !== undefined && change !== null && (
          <div className={`metrics-card-change metrics-card-change--${changeType}`}>
            <span className="change-indicator">
              {changeType === 'positive' && '↗'}
              {changeType === 'negative' && '↘'}
              {changeType === 'neutral' && '→'}
            </span>
            {formatChange(change)}
          </div>
        )}

        {showTrend && renderSparkline()}
      </div>

      {description && (
        <div className="metrics-card-description">
          {description}
        </div>
      )}

      <div className="metrics-card-glow"></div>
    </div>
  );
};

export default MetricsCard;