import {
  ADMIN_MANAGER_WORKFLOW_RULES,
  BATCH_6_DEFERRED_ITEMS,
  getAdminWorkflowAuditPlan,
  summarizeAdminWorkflowReadiness
} from './adminWorkflowAuditService';

describe('adminWorkflowAuditService', () => {
  it('lists every current admin manager that needs CRUD or upload verification', () => {
    const managerIds = ADMIN_MANAGER_WORKFLOW_RULES.map(rule => rule.id);

    expect(managerIds).toEqual([
      'hero-content',
      'about-section',
      'projects',
      'internships',
      'education',
      'work-experience',
      'skills',
      'certifications',
      'recommendations',
      'achievements',
      'leadership',
      'contact-messages',
      'media-library',
      'analytics-dashboard'
    ]);
  });

  it('captures upload buckets and fields for upload-capable managers', () => {
    const plan = getAdminWorkflowAuditPlan();
    const uploadManagers = plan.managers
      .filter(manager => manager.uploads.length > 0)
      .map(manager => [manager.id, manager.uploads.map(upload => upload.bucket)]);

    expect(uploadManagers).toEqual([
      ['about-section', ['profile-images', 'profile-images']],
      ['projects', ['project-images']],
      ['internships', ['organization-logos', 'documents']],
      ['education', ['organization-logos']],
      ['work-experience', ['organization-logos']],
      ['skills', ['skill-icons', 'skill-icons']],
      ['certifications', ['certification-badges', 'certification-badges', 'certification-badges']],
      ['recommendations', ['profile-images']],
      ['achievements', ['achievement-images']]
    ]);
  });

  it('summarizes CRUD and upload readiness without including deferred future work', () => {
    const summary = summarizeAdminWorkflowReadiness(ADMIN_MANAGER_WORKFLOW_RULES);

    expect(summary).toEqual({
      totalManagers: 14,
      crudManagers: 12,
      uploadCapableManagers: 9,
      uploadChecks: 14,
      readOnlyManagers: 2,
      pendingBrowserVerification: 14
    });

    expect(BATCH_6_DEFERRED_ITEMS).toEqual([
      'Real GitHub and LinkedIn analytics',
      'Admin space/3D theme exploration',
      'Supabase Postgres platform patch upgrade'
    ]);
  });
});
