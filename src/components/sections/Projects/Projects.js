import React, { useState, useEffect } from 'react';
import ProjectCard from './ProjectCard';
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
          
          // Sort projects: featured projects first, then by other criteria
          const sortedProjects = [...projectsData].sort((a, b) => {
            // Primary sort: featured projects first
            // The 'featured' property is checked on each project object.
            if (a.featured && !b.featured) return -1; // a (featured) comes before b (not featured)
            if (!a.featured && b.featured) return 1;  // b (featured) comes before a (not featured)

            // Secondary sort: by creation date (newest first), similar to recommendations
            // This assumes projects might have a 'created_at' field like recommendations.
            if (a.created_at && b.created_at) {
              try {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                // Check if dates are valid before attempting to compare
                if (!isNaN(dateA) && !isNaN(dateB)) {
                  // Sort by date descending (newest first)
                  return dateB.getTime() - dateA.getTime(); 
                }
              } catch (e) {
                console.warn("Could not parse created_at for sorting projects:", e);
              }
            }
            
            // Fallback secondary sort: by project ID (descending, assuming higher ID is newer)
            // The ProjectCard component uses 'project.id' as a key, suggesting its availability.
            if (a.id && b.id) {
              // Ensure IDs are numbers if they are numeric strings
              const idA = typeof a.id === 'string' ? parseInt(a.id, 10) : a.id;
              const idB = typeof b.id === 'string' ? parseInt(b.id, 10) : b.id;
              if (!isNaN(idA) && !isNaN(idB)) {
                 return idB - idA; // Higher ID (newer) first
              }
            }

            // Further fallback: by title alphabetically if other criteria are not available or equal
            // The 'project.title' is a primary display field.
            if (a.title && b.title) {
              return a.title.localeCompare(b.title); // Sort by title ascending
            }

            return 0; // Keep original relative order if no other criteria met
          });
          
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