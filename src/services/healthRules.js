// src/services/healthRules.js
//
// The portfolio health rules and the pure arithmetic that scores them. No
// Supabase here: the fix queue (Voyage/fixQueueModel.js) and anything else
// that only needs the scoring import this module and never open the client.
// analyticsService.js loads the rows and re-exports these names unchanged.

// How one active item is scored inside its section: up to REQUIRED_SHARE points
// for its required fields and QUALITY_SHARE points for its quality groups.
// Exported, with the helpers below, so the fix queue (Voyage/fixQueueModel.js)
// runs the same arithmetic forward; the numbers themselves never change.
export const REQUIRED_SHARE = 70;
export const QUALITY_SHARE = 30;
export const DEFAULT_MIN_DESCRIPTION_LENGTH = 40;

export const SECTION_HEALTH_RULES = [
  {
    name: 'Hero',
    table: 'hero_content',
    weight: 12,
    minItems: 1,
    requiredFields: ['title', 'description'],
    descriptionFields: ['description'],
    qualityGroups: [
      { name: 'cta', label: 'CTA link', fields: ['cta_link'], issueType: 'missing_proof_link' },
      { name: 'resume', label: 'Resume', fields: ['resume_url'], issueType: 'missing_proof_link' }
    ]
  },
  {
    name: 'About',
    table: 'about_content',
    weight: 12,
    minItems: 1,
    requiredFields: ['about_me_title', 'about_me_content'],
    descriptionFields: ['about_me_content'],
    qualityGroups: [
      {
        name: 'profile image',
        label: 'profile image',
        fields: ['profile_image_about', 'profile_image_info', 'profile_image_url'],
        issueType: 'missing_image'
      }
    ]
  },
  {
    name: 'Projects',
    table: 'projects',
    weight: 20,
    minItems: 3,
    requiredFields: ['title', 'short_description'],
    descriptionFields: ['short_description', 'detailed_description'],
    qualityGroups: [
      { name: 'images', label: 'project image', fields: ['image_urls', 'image_url'], issueType: 'missing_image' },
      { name: 'proof', label: 'GitHub or live link', fields: ['github_urls', 'github_url', 'live_url'], issueType: 'missing_proof_link' }
    ]
  },
  {
    name: 'Internships',
    table: 'internships',
    weight: 10,
    minItems: 1,
    requiredFields: ['title', 'company', 'description'],
    descriptionFields: ['description'],
    qualityGroups: [
      { name: 'company logo', label: 'company logo', fields: ['company_logo_url', 'logo_url'], issueType: 'missing_image' },
      { name: 'proof', label: 'proof link or certificate', fields: ['certificate_urls', 'certificate_url', 'offer_letter_url'], issueType: 'missing_proof_link' }
    ]
  },
  {
    name: 'Education',
    table: 'education',
    weight: 10,
    minItems: 1,
    requiredFields: ['degree', 'institution'],
    descriptionFields: ['description'],
    qualityGroups: [
      { name: 'institution logo', label: 'institution logo', fields: ['institution_logo_url'], issueType: 'missing_image' }
    ]
  },
  {
    name: 'Work Experience',
    table: 'work_experience',
    weight: 10,
    minItems: 1,
    requiredFields: ['title', 'company', 'description'],   // the role column is title; 'position' flagged every role as a critical gap
    descriptionFields: ['description'],
    qualityGroups: [
      { name: 'company logo', label: 'company logo', fields: ['company_logo_url', 'logo_url'], issueType: 'missing_image' }
    ]
  },
  {
    name: 'Skills',
    table: 'skills',
    weight: 8,
    minItems: 8,
    requiredFields: ['skill_name'],   // the column is skill_name; 'name' flagged every skill as a critical gap
    qualityGroups: [
      { name: 'category', label: 'category', fields: ['category'], issueType: 'missing_required_field' }
    ]
  },
  {
    name: 'Certifications',
    table: 'certifications',
    weight: 8,
    minItems: 2,
    requiredFields: ['title', 'issuer'],
    descriptionFields: ['description'],
    qualityGroups: [
      { name: 'proof', label: 'certificate or verification link', fields: ['certificate_pdf_url', 'credential_url'], issueType: 'missing_proof_link' },
      { name: 'badge', label: 'badge image', fields: ['badge_image_url'], issueType: 'missing_image' }
    ]
  },
  {
    name: 'Recommendations',
    table: 'recommendations',
    weight: 4,
    minItems: 1,
    requiredFields: ['recommender_name', 'content'],   // the text column is content; 'recommendation_text' flagged every row
    descriptionFields: ['content'],
    qualityGroups: [
      { name: 'recommender proof', label: 'LinkedIn or profile proof', fields: ['linkedin_profile_url'], issueType: 'missing_proof_link' }
    ]
  },
  {
    name: 'Achievements',
    table: 'achievements',
    weight: 4,
    minItems: 1,
    requiredFields: ['title', 'description'],
    descriptionFields: ['description'],
    qualityGroups: [
      { name: 'proof', label: 'certificate or proof link', fields: ['certificate_url', 'verification_url'], issueType: 'missing_proof_link' }
    ]
  },
  {
    name: 'Leadership',
    table: 'leadership',
    weight: 2,
    minItems: 1,
    requiredFields: ['title', 'organization', 'description'],
    descriptionFields: ['description'],
    // the leadership table has no link or image column, so a proof group could only ever report a gap
    qualityGroups: []
  }
];

export const hasUsableValue = (value) => {
  if (Array.isArray(value)) {
    return value.some(hasUsableValue);
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return value !== null && value !== undefined;
};

export const getRowLabel = (row = {}) => (
  row.title ||
  row.name ||
  row.degree ||
  row.position ||
  row.company ||
  row.organization ||
  row.recommender_name ||
  row.id ||
  'Untitled item'
);

export const isActiveContentRow = (row = {}) => {
  if (row.is_active === false) {
    return false;
  }

  const status = String(row.status || row.content_status || '').toLowerCase();
  if (['draft', 'archived', 'inactive', 'hidden', 'disabled'].includes(status)) {
    return false;
  }

  return true;
};

export const fieldIsComplete = (row, field, rule) => {
  const value = row?.[field];

  if (!hasUsableValue(value)) {
    return false;
  }

  if ((rule.descriptionFields || []).includes(field) && typeof value === 'string') {
    return value.trim().length >= (rule.minDescriptionLength || DEFAULT_MIN_DESCRIPTION_LENGTH);
  }

  return true;
};

export const hasAnyFieldValue = (row, fields = []) => (
  fields.some(field => fieldIsComplete(row, field, { descriptionFields: [] }))
);

export const createHealthIssue = ({ section, item, type, severity, message }) => ({
  section,
  item,
  type,
  severity,
  message
});

export const evaluateContentSectionHealth = (rule, rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const activeRows = safeRows.filter(isActiveContentRow);
  const issues = [];
  const minItems = rule.minItems || 1;
  const requiredFields = rule.requiredFields || [];
  const qualityGroups = rule.qualityGroups || [];

  if (activeRows.length === 0) {
    issues.push(createHealthIssue({
      section: rule.name,
      item: null,
      type: 'inactive_required_section',
      severity: 'critical',
      message: `${rule.name} has no active content.`
    }));

    return {
      name: rule.name,
      table: rule.table,
      weight: rule.weight || 0,
      totalItems: safeRows.length,
      activeItems: 0,
      requiredFields,
      completeness: 0,
      hasContent: false,
      issues
    };
  }

  if (activeRows.length < minItems) {
    issues.push(createHealthIssue({
      section: rule.name,
      item: null,
      type: 'minimum_content_not_met',
      severity: 'warning',
      message: `${rule.name} has ${activeRows.length} active item${activeRows.length === 1 ? '' : 's'}, target is ${minItems}.`
    }));
  }

  const itemScores = activeRows.map(row => {
    const label = getRowLabel(row);
    const requiredComplete = requiredFields.filter(field => fieldIsComplete(row, field, rule)).length;
    const requiredRatio = requiredFields.length > 0
      ? requiredComplete / requiredFields.length
      : 1;

    requiredFields.forEach(field => {
      if (!fieldIsComplete(row, field, rule)) {
        const isWeakDescription = (rule.descriptionFields || []).includes(field) && hasUsableValue(row[field]);
        issues.push(createHealthIssue({
          section: rule.name,
          item: label,
          type: isWeakDescription ? 'weak_description' : 'missing_required_field',
          severity: isWeakDescription ? 'info' : 'critical',
          message: isWeakDescription
            ? `${label} has a weak ${field.replace(/_/g, ' ')}.`
            : `${label} is missing ${field.replace(/_/g, ' ')}.`
        }));
      }
    });

    const qualityComplete = qualityGroups.filter(group => hasAnyFieldValue(row, group.fields)).length;
    const qualityRatio = qualityGroups.length > 0
      ? qualityComplete / qualityGroups.length
      : 1;

    qualityGroups.forEach(group => {
      if (!hasAnyFieldValue(row, group.fields)) {
        issues.push(createHealthIssue({
          section: rule.name,
          item: label,
          type: group.issueType || 'quality_gap',
          severity: group.issueType === 'missing_required_field' ? 'critical' : 'warning',
          message: `${label} is missing ${group.label}.`
        }));
      }
    });

    return (requiredRatio * REQUIRED_SHARE) + (qualityRatio * QUALITY_SHARE);
  });

  const averageItemScore = itemScores.reduce((sum, score) => sum + score, 0) / itemScores.length;
  const volumeMultiplier = Math.min(1, activeRows.length / minItems);
  const completeness = Math.round(averageItemScore * volumeMultiplier);

  return {
    name: rule.name,
    table: rule.table,
    weight: rule.weight || 0,
    totalItems: safeRows.length,
    activeItems: activeRows.length,
    requiredFields,
    completeness,
    hasContent: activeRows.length > 0,
    issues
  };
};

const severityRank = {
  critical: 0,
  warning: 1,
  info: 2
};

export const summarizePortfolioHealth = (sections = []) => {
  const totalWeight = sections.reduce((sum, section) => sum + (section.weight || 0), 0);
  const weightedScore = totalWeight > 0
    ? sections.reduce((sum, section) => sum + ((section.completeness || 0) * (section.weight || 0)), 0) / totalWeight
    : 0;

  const issues = sections.flatMap(section => (
    (section.issues || []).map(issue => ({
      ...issue,
      section: issue.section || section.name
    }))
  ));

  const issueCounts = issues.reduce((counts, issue) => ({
    ...counts,
    [issue.severity]: (counts[issue.severity] || 0) + 1
  }), { critical: 0, warning: 0, info: 0 });

  const score = Math.round(weightedScore);
  let status = 'ready';

  if (issueCounts.critical > 0 || score < 70) {
    status = 'needs_attention';
  } else if (issueCounts.warning > 0 || score < 90) {
    status = 'improving';
  }

  return {
    score,
    status,
    issueCounts,
    topIssues: issues
      .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3))
      .slice(0, 8),
    sectionCount: sections.length,
    completedSections: sections.filter(section => (section.completeness || 0) >= 90).length
  };
};
