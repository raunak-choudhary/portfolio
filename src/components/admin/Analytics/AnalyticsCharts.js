// src/components/admin/Analytics/AnalyticsCharts.js
import React, { useState, useEffect, useRef } from 'react';
import './AnalyticsCharts.css';

// ===== LINE CHART COMPONENT =====
export const LineChart = ({ 
  data = [], 
  width = 400, 
  height = 300, 
  color = 'var(--neon-cyan)', 
  title = '',
  showGrid = true,
  showTooltip = true,
  animate = true,
  responsive = true
}) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, data: null });
  const [mounted, setMounted] = useState(false);
  const svgRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div className="empty-icon">📈</div>
        <p>No data available for line chart</p>
      </div>
    );
  }

  const values = data.map(d => d.value || 0);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((point.value - minValue) / range) * 80;
    return { x, y, ...point };
  });

  const pathData = points.map((point, index) => 
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  const handleMouseMove = (event, point) => {
    if (!showTooltip) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      data: point
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ visible: false, x: 0, y: 0, data: null });
  };

  return (
    <div className={`analytics-chart line-chart ${responsive ? 'responsive' : ''}`}>
      {title && <h3 className="chart-title">{title}</h3>}
      
      <div className="chart-container" style={{ width, height }}>
        <svg 
          ref={svgRef}
          viewBox="0 0 100 100" 
          className="chart-svg"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {showGrid && (
            <g className="chart-grid">
              {[20, 40, 60, 80].map(y => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} className="grid-line" />
              ))}
              {data.length > 1 && data.map((_, index) => {
                const x = (index / (data.length - 1)) * 100;
                return <line key={index} x1={x} y1="0" x2={x} y2="100" className="grid-line" />;
              })}
            </g>
          )}
          
          {/* Area fill */}
          <path
            className="chart-area"
            d={`${pathData} L 100 100 L 0 100 Z`}
            fill={`url(#gradient-${color.replace(/[^a-zA-Z0-9]/g, '')})`}
            style={{ '--chart-color': color }}
          />
          
          {/* Line path */}
          <path
            className={`chart-line ${animate && mounted ? 'animate' : ''}`}
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth="2"
            style={{ '--path-length': pathData.length }}
          />
          
          {/* Data points */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="3"
              fill={color}
              className={`chart-point ${animate ? 'animate' : ''}`}
              style={{ '--animation-delay': `${index * 0.1}s` }}
              onMouseMove={(e) => handleMouseMove(e, point)}
              onMouseLeave={handleMouseLeave}
            />
          ))}
          
          {/* Gradient definitions */}
          <defs>
            <linearGradient id={`gradient-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Tooltip */}
        {tooltip.visible && tooltip.data && (
          <div 
            className="chart-tooltip"
            style={{ 
              left: tooltip.x + 10, 
              top: tooltip.y - 10,
              '--tooltip-color': color
            }}
          >
            <div className="tooltip-title">{tooltip.data.label || tooltip.data.date}</div>
            <div className="tooltip-value">{tooltip.data.value}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===== BAR CHART COMPONENT =====
export const BarChart = ({ 
  data = [], 
  width = 400, 
  height = 300, 
  color = 'var(--neon-purple)', 
  title = '',
  horizontal = false,
  showValues = true,
  animate = true,
  responsive = true
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div className="empty-icon">📊</div>
        <p>No data available for bar chart</p>
      </div>
    );
  }

  const values = data.map(d => d.value || 0);
  const maxValue = Math.max(...values) || 1;

  return (
    <div className={`analytics-chart bar-chart ${horizontal ? 'horizontal' : 'vertical'} ${responsive ? 'responsive' : ''}`}>
      {title && <h3 className="chart-title">{title}</h3>}
      
      <div className="chart-container" style={{ width, height }}>
        <div className="bars-container">
          {data.map((item, index) => {
            const percentage = (item.value / maxValue) * 100;
            
            return (
              <div 
                key={index}
                className={`bar-item ${animate && mounted ? 'animate' : ''}`}
                style={{ '--animation-delay': `${index * 0.1}s` }}
              >
                <div className="bar-label">{item.label}</div>
                <div className="bar-wrapper">
                  <div 
                    className="bar"
                    style={{ 
                      [horizontal ? 'width' : 'height']: `${percentage}%`,
                      backgroundColor: color,
                      '--bar-color': color
                    }}
                  >
                    {showValues && (
                      <span className="bar-value">{item.value}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ===== DONUT CHART COMPONENT =====
export const DonutChart = ({ 
  data = [], 
  width = 300, 
  height = 300, 
  title = '',
  showLegend = true,
  showPercentages = true,
  animate = true,
  responsive = true,
  centerText = ''
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div className="empty-icon">🍩</div>
        <p>No data available for donut chart</p>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  
  let cumulativePercentage = 0;

  const colors = [
    'var(--neon-cyan)',
    'var(--neon-purple)', 
    'var(--neon-pink)',
    'var(--neon-orange)',
    'var(--neon-emerald)'
  ];

  return (
    <div className={`analytics-chart donut-chart ${responsive ? 'responsive' : ''}`}>
      {title && <h3 className="chart-title">{title}</h3>}
      
      <div className="chart-container" style={{ width, height }}>
        <div className="donut-wrapper">
          <svg viewBox="0 0 100 100" className="donut-svg">
            {data.map((item, index) => {
              const percentage = (item.value / total) * 100;
              const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
              const rotation = (cumulativePercentage / 100) * 360;
              const color = item.color || colors[index % colors.length];
              
              cumulativePercentage += percentage;
              
              return (
                <circle
                  key={index}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="10"
                  strokeDasharray={strokeDasharray}
                  transform={`rotate(${rotation - 90} 50 50)`}
                  className={`donut-segment ${animate && mounted ? 'animate' : ''}`}
                  style={{ 
                    '--animation-delay': `${index * 0.2}s`,
                    '--segment-color': color
                  }}
                />
              );
            })}
          </svg>
          
          {centerText && (
            <div className="donut-center">
              <div className="center-text">{centerText}</div>
            </div>
          )}
        </div>
        
        {showLegend && (
          <div className="donut-legend">
            {data.map((item, index) => {
              const percentage = ((item.value / total) * 100).toFixed(1);
              const color = item.color || colors[index % colors.length];
              
              return (
                <div key={index} className="legend-item">
                  <div 
                    className="legend-color"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span className="legend-label">{item.label}</span>
                  <span className="legend-value">
                    {item.value}
                    {showPercentages && <span className="percentage"> ({percentage}%)</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ===== AREA CHART COMPONENT =====
export const AreaChart = ({ 
  data = [], 
  width = 400, 
  height = 300, 
  color = 'var(--neon-emerald)', 
  title = '',
  showGrid = true,
  showLine = true,
  animate = true,
  responsive = true
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <div className="empty-icon">📈</div>
        <p>No data available for area chart</p>
      </div>
    );
  }

  const values = data.map(d => d.value || 0);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((point.value - minValue) / range) * 80;
    return { x, y, ...point };
  });

  const pathData = points.map((point, index) => 
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  const areaPath = `${pathData} L 100 100 L 0 100 Z`;

  return (
    <div className={`analytics-chart area-chart ${responsive ? 'responsive' : ''}`}>
      {title && <h3 className="chart-title">{title}</h3>}
      
      <div className="chart-container" style={{ width, height }}>
        <svg viewBox="0 0 100 100" className="chart-svg" preserveAspectRatio="none">
          {/* Grid */}
          {showGrid && (
            <g className="chart-grid">
              {[20, 40, 60, 80].map(y => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} className="grid-line" />
              ))}
            </g>
          )}
          
          {/* Area fill */}
          <path
            className={`chart-area ${animate && mounted ? 'animate' : ''}`}
            d={areaPath}
            fill={`url(#area-gradient-${color.replace(/[^a-zA-Z0-9]/g, '')})`}
            style={{ '--chart-color': color }}
          />
          
          {/* Line */}
          {showLine && (
            <path
              className={`chart-line ${animate && mounted ? 'animate' : ''}`}
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth="2"
            />
          )}
          
          {/* Gradient definition */}
          <defs>
            <linearGradient id={`area-gradient-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
};

// ===== MULTI CHART COMPONENT =====
export const MultiChart = ({ 
  datasets = [], 
  width = 500, 
  height = 300, 
  title = '',
  showGrid = true,
  showLegend = true,
  animate = true,
  responsive = true
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!datasets || datasets.length === 0) {
    return (
      <div className="chart-empty">
        <div className="empty-icon">📊</div>
        <p>No datasets available for multi chart</p>
      </div>
    );
  }

  // Find global min/max across all datasets
  const allValues = datasets.flatMap(dataset => dataset.data.map(d => d.value || 0));
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const range = maxValue - minValue || 1;

  const colors = [
    'var(--neon-cyan)',
    'var(--neon-purple)', 
    'var(--neon-pink)',
    'var(--neon-orange)',
    'var(--neon-emerald)'
  ];

  return (
    <div className={`analytics-chart multi-chart ${responsive ? 'responsive' : ''}`}>
      {title && <h3 className="chart-title">{title}</h3>}
      
      <div className="chart-container" style={{ width, height }}>
        <svg viewBox="0 0 100 100" className="chart-svg" preserveAspectRatio="none">
          {/* Grid */}
          {showGrid && (
            <g className="chart-grid">
              {[20, 40, 60, 80].map(y => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} className="grid-line" />
              ))}
            </g>
          )}
          
          {/* Render each dataset */}
          {datasets.map((dataset, datasetIndex) => {
            const color = dataset.color || colors[datasetIndex % colors.length];
            const points = dataset.data.map((point, index) => {
              const x = (index / (dataset.data.length - 1)) * 100;
              const y = 100 - ((point.value - minValue) / range) * 80;
              return { x, y, ...point };
            });

            const pathData = points.map((point, index) => 
              `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
            ).join(' ');

            return (
              <g key={datasetIndex}>
                <path
                  className={`chart-line ${animate && mounted ? 'animate' : ''}`}
                  d={pathData}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  style={{ '--animation-delay': `${datasetIndex * 0.2}s` }}
                />
                {points.map((point, pointIndex) => (
                  <circle
                    key={pointIndex}
                    cx={point.x}
                    cy={point.y}
                    r="2"
                    fill={color}
                    className={`chart-point ${animate ? 'animate' : ''}`}
                    style={{ '--animation-delay': `${(datasetIndex * 0.2) + (pointIndex * 0.05)}s` }}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        
        {showLegend && (
          <div className="multi-chart-legend">
            {datasets.map((dataset, index) => {
              const color = dataset.color || colors[index % colors.length];
              return (
                <div key={index} className="legend-item">
                  <div 
                    className="legend-line"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span className="legend-label">{dataset.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ===== SPARKLINE COMPONENT =====
export const Sparkline = ({ 
  data = [], 
  width = 100, 
  height = 30, 
  color = 'var(--neon-cyan)',
  showArea = false,
  animate = true
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!data || data.length === 0) {
    return <div className="sparkline-empty">-</div>;
  }

  const values = data.map(d => typeof d === 'number' ? d : d.value || 0);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 100 - ((value - minValue) / range) * 100;
    return { x, y };
  });

  const pathData = points.map((point, index) => 
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  return (
    <div className="analytics-sparkline" style={{ width, height }}>
      <svg viewBox="0 0 100 100" className="sparkline-svg" preserveAspectRatio="none">
        {showArea && (
          <path
            className={`sparkline-area ${animate && mounted ? 'animate' : ''}`}
            d={`${pathData} L 100 100 L 0 100 Z`}
            fill={color}
            fillOpacity="0.2"
          />
        )}
        <path
          className={`sparkline-line ${animate && mounted ? 'animate' : ''}`}
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
};

// ===== MAIN ANALYTICS CHARTS COMPONENT =====
const AnalyticsCharts = {
  LineChart,
  BarChart,
  DonutChart,
  AreaChart,
  MultiChart,
  Sparkline
};

export default AnalyticsCharts;