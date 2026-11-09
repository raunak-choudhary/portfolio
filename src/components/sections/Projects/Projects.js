import React, { useState, useEffect } from 'react';
import ProjectCard from './ProjectCard';
import { sortProjects } from './projectFormat';
import { getProjects } from '../../../services/dataService';
import LoadingSpinner from '../../common/LoadingSpinner';
import './Projects.css';

const Projects = () => {
  // State management
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch projects data from API
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        console.log('🔍 Fetching projects data...');
        setLoading(true);
        setError(null);
        
        const response = await getProjects();
        
        if (response.success) {
          console.log('✅ Projects fetched successfully:', response.data?.length || 0, 'projects');
          const projectsData = Array.isArray(response.data) ? response.data : [];
          
          // Featured first, then newest build first (see sortProjects).
          const sortedProjects = sortProjects(projectsData);
          
          setProjects(sortedProjects);
        } else {
          console.error('❌ Failed to fetch projects:', response.error);
          setError(response.error);
          setProjects([]);
        }
      } catch (error) {
        console.error('❌ Projects fetch error:', error);
        setError(error.message);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Show loading spinner
  if (loading) {
    return (
      <section className="projects-section section">
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <LoadingSpinner size="large" message="Loading projects..." />
        </div>
      </section>
    );
  }

  return (
    <section className="projects-section section">
      <div className="container">
        {/* Header matching Explore Portfolio section style */}
        <div className="section-header">
          <h1 className="neon-title">Projects</h1>
          <p className="neon-subtitle">Showcase of my technical projects and applications</p>
        </div>

        <div className="projects-content">
          {error ? (
            // Error state
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9v4m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">Error Loading Projects</h3>
              <p className="no-content-text">
                {error || 'Something went wrong while loading projects. Please try again later.'}
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : projects.length === 0 ? (
            // No projects state
            <div className="no-content-message glass-card">
              <div className="no-content-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M8 21L9.91 16.26L19 15L9.91 13.74L8 9L6.09 13.74L-3 15L6.09 16.26L8 21Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="no-content-title">No Projects Available</h3>
              <p className="no-content-text">
                No information present. Projects will be displayed here once they are added to the portfolio.
              </p>
              <div className="no-content-decoration">
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
                <div className="floating-particle"></div>
              </div>
            </div>
          ) : (
            // Projects grid - display actual data
            <div className="projects-grid">
              {projects.map((project, index) => (
                // The ProjectCard receives the project data, which includes the 'featured' status and 'id'.
                <ProjectCard key={project.id || index} project={project} /> 
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Projects;