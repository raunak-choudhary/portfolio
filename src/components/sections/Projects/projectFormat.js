// src/components/sections/Projects/projectFormat.js
//
// Pure helpers shared by the public projects section and the admin projects
// manager, kept free of React so they can be unit tested directly.

/**
 * Human label for a project's team size: "Solo" for one person or an unknown
 * size, otherwise "Team of N". The card shows this instead of a member count
 * so a visitor can tell individual work from team work at a glance.
 */
export const teamLabel = (teamSize) => {
  const size = Number(teamSize);
  if (!Number.isInteger(size) || size <= 1) return 'Solo';
  return `Team of ${size}`;
};

/**
 * Returns the URL as a full https address suitable for both the link target
 * and the visible link text, or '' when it is not a usable web address.
 * Accepts addresses stored without a scheme ("github.com/x/y") and upgrades
 * plain http, so every repository link a visitor sees is complete and safe.
 * Anything that is not http(s), such as "javascript:", is rejected.
 */
export const toHttpsUrl = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!url.hostname.includes('.')) return '';
    url.protocol = 'https:';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

const timeOf = (value) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

/**
 * Page order for projects: featured first, then by build order with the most
 * recent first (a higher `order_index` is a later project; projects without
 * one go last), then newest `created_at` first. Returns a new array.
 */
export const sortProjects = (projects) => {
  if (!Array.isArray(projects)) return [];
  return [...projects].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    const aOrder = Number.isFinite(a.order_index) ? a.order_index : null;
    const bOrder = Number.isFinite(b.order_index) ? b.order_index : null;
    if (aOrder !== bOrder) {
      if (aOrder === null) return 1;
      if (bOrder === null) return -1;
      return bOrder - aOrder;
    }
    return timeOf(b.created_at) - timeOf(a.created_at);
  });
};
