export const BATCH_6_DEFERRED_ITEMS = [
  'Real GitHub and LinkedIn analytics',
  'Admin space/3D theme exploration',
  'Supabase Postgres platform patch upgrade'
];

export const ADMIN_MANAGER_WORKFLOW_RULES = [
  {
    id: 'hero-content',
    label: 'Hero Content',
    table: 'hero_content',
    workflow: 'crud',
    uploads: [],
    browserChecks: ['load', 'edit', 'save', 'public refresh']
  },
  {
    id: 'about-section',
    label: 'About Section',
    table: 'about_content',
    workflow: 'crud',
    uploads: [
      { bucket: 'profile-images', field: 'profile_image_about', action: 'upload about image' },
      { bucket: 'profile-images', field: 'profile_image_info', action: 'upload info image' }
    ],
    browserChecks: ['load', 'edit', 'save', 'upload images', 'public refresh']
  },
  {
    id: 'projects',
    label: 'Projects',
    table: 'projects',
    workflow: 'crud',
    uploads: [
      { bucket: 'project-images', field: 'image_urls', action: 'upload, remove, and folder cleanup' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload images', 'remove image', 'public refresh']
  },
  {
    id: 'internships',
    label: 'Internships',
    table: 'internships',
    workflow: 'crud',
    uploads: [
      { bucket: 'organization-logos', field: 'company_logo_url', action: 'upload and remove logo' },
      { bucket: 'documents', field: 'certificate_urls', action: 'upload and remove certificates' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload logo', 'upload certificates', 'public refresh']
  },
  {
    id: 'education',
    label: 'Education',
    table: 'education',
    workflow: 'crud',
    uploads: [
      { bucket: 'organization-logos', field: 'institution_logo_url', action: 'upload logo' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload logo', 'public refresh']
  },
  {
    id: 'work-experience',
    label: 'Work Experience',
    table: 'work_experience',
    workflow: 'crud',
    uploads: [
      { bucket: 'organization-logos', field: 'company_logo_url', action: 'upload logo' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload logo', 'public refresh']
  },
  {
    id: 'skills',
    label: 'Skills',
    table: 'skills',
    workflow: 'crud',
    uploads: [
      { bucket: 'skill-icons', field: 'icon_url', action: 'upload and remove icon' },
      { bucket: 'skill-icons', field: 'certifications', action: 'upload and remove certificates' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload icon', 'upload certificates', 'public refresh']
  },
  {
    id: 'certifications',
    label: 'Certifications',
    table: 'certifications',
    workflow: 'crud',
    uploads: [
      { bucket: 'certification-badges', field: 'issuer_logo_url', action: 'upload and remove issuer logo' },
      { bucket: 'certification-badges', field: 'badge_image_url', action: 'upload and remove badge' },
      { bucket: 'certification-badges', field: 'certificate_pdf_url', action: 'upload and remove certificate file' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload all files', 'public refresh']
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    table: 'recommendations',
    workflow: 'crud',
    uploads: [
      { bucket: 'profile-images', field: 'profile_image_url', action: 'upload and remove profile image' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload profile image', 'public refresh']
  },
  {
    id: 'achievements',
    label: 'Achievements',
    table: 'achievements',
    workflow: 'crud',
    uploads: [
      { bucket: 'achievement-images', field: 'certificate_url', action: 'upload and remove certificate file' }
    ],
    browserChecks: ['load', 'create', 'edit', 'delete', 'upload certificate', 'public refresh']
  },
  {
    id: 'leadership',
    label: 'Leadership',
    table: 'leadership',
    workflow: 'crud',
    uploads: [],
    browserChecks: ['load', 'create', 'edit', 'delete', 'public refresh']
  },
  {
    id: 'contact-messages',
    label: 'Contact Messages',
    table: 'contact_messages',
    workflow: 'crud',
    uploads: [],
    browserChecks: ['load', 'status update', 'archive', 'delete', 'signed attachment open']
  },
  {
    id: 'media-library',
    label: 'Media Library',
    table: null,
    workflow: 'read-only',
    uploads: [],
    browserChecks: ['load buckets', 'preview public file', 'preview private signed file']
  },
  {
    id: 'analytics-dashboard',
    label: 'Analytics Dashboard',
    table: null,
    workflow: 'read-only',
    uploads: [],
    browserChecks: ['load portfolio health', 'load visitor analytics', 'show honest unavailable states']
  }
];

export const summarizeAdminWorkflowReadiness = (rules = ADMIN_MANAGER_WORKFLOW_RULES) => {
  const uploadCapableManagers = rules.filter(rule => rule.uploads.length > 0);

  return {
    totalManagers: rules.length,
    crudManagers: rules.filter(rule => rule.workflow === 'crud').length,
    uploadCapableManagers: uploadCapableManagers.length,
    uploadChecks: uploadCapableManagers.reduce((total, rule) => total + rule.uploads.length, 0),
    readOnlyManagers: rules.filter(rule => rule.workflow === 'read-only').length,
    pendingBrowserVerification: rules.length
  };
};

export const getAdminWorkflowAuditPlan = () => ({
  scope: 'Batch 6 CRUD manager stabilization and upload verification readiness',
  managers: ADMIN_MANAGER_WORKFLOW_RULES,
  summary: summarizeAdminWorkflowReadiness(ADMIN_MANAGER_WORKFLOW_RULES),
  deferredItems: BATCH_6_DEFERRED_ITEMS
});
