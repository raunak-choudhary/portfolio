// scripts/lib/projects-import.mjs
//
// Turns the reviewed project list (supabase/seed/projects.json) into one SQL
// script that brings the projects table to exactly that list. The script is
// reviewed by the owner and run in the Supabase SQL editor; nothing here talks
// to the database.
//
// Safety properties of the generated SQL:
//   - It runs as one PL/pgSQL block, so it applies completely or not at all.
//   - Each existing project is updated by its current title and must match
//     exactly one row; each new project must not exist yet. Anything else
//     aborts the whole block with a message naming the project.
//   - It never deletes rows and never touches image_urls, so screenshots the
//     owner uploaded survive. challenges and learnings are cleared on purpose
//     (owner decision: the card back stays short).
//   - It finishes by checking that the table holds exactly the listed number
//     of active projects, which fails loudly if stale rows remain.

const TEXT_FIELDS = ['title', 'short_description', 'detailed_description', 'project_type', 'duration', 'awards'];
const JSON_FIELDS = ['technologies', 'github_urls', 'key_features'];
const GITHUB_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Quotes a value as a SQL string literal, or NULL for null and undefined. */
export const sqlText = (value) => {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
};

/** Quotes an array or object as a jsonb literal. */
export const sqlJson = (value) => `${sqlText(JSON.stringify(value ?? []))}::jsonb`;

/**
 * Validates the seed and returns its projects, throwing an error that names
 * the first problem found. Validation covers every rule the owner set for
 * public project data.
 */
export const validateSeed = (seed) => {
  const projects = seed?.projects;
  if (!Array.isArray(projects) || projects.length === 0) throw new Error('seed has no projects');
  const titles = new Set();
  const orders = new Set();
  projects.forEach((project, index) => {
    const label = `project ${index + 1} (${project?.title ?? 'untitled'})`;
    if (!project?.title?.trim()) throw new Error(`${label}: title is required`);
    if (/[()]/.test(project.title)) throw new Error(`${label}: titles must not contain parentheses`);
    if (titles.has(project.title)) throw new Error(`${label}: duplicate title`);
    titles.add(project.title);
    if (!Number.isInteger(project.order_index) || orders.has(project.order_index)) {
      throw new Error(`${label}: order_index must be a unique integer`);
    }
    orders.add(project.order_index);
    if (!Number.isInteger(project.team_size) || project.team_size < 1) {
      throw new Error(`${label}: team_size must be a positive integer`);
    }
    if (!Array.isArray(project.github_urls) || project.github_urls.length === 0) {
      throw new Error(`${label}: at least one GitHub URL is required`);
    }
    project.github_urls.forEach((url) => {
      if (!GITHUB_URL.test(url)) throw new Error(`${label}: GitHub URL must be a full https address: ${url}`);
    });
    const features = project.key_features ?? [];
    if (features.length < 3 || features.length > 5) throw new Error(`${label}: needs 3 to 5 key features`);
    if (project.awards != null && String(project.awards).length > 200) {
      throw new Error(`${label}: awards must be 200 characters or fewer`);
    }
    for (const field of ['short_description', 'detailed_description']) {
      if (!project[field]?.trim()) throw new Error(`${label}: ${field} is required`);
      if (project[field].includes('$$')) throw new Error(`${label}: ${field} must not contain $$`);
    }
  });
  return projects;
};

/** Column assignments shared by updates and inserts, in a stable order. */
const columnValues = (project) => [
  ...TEXT_FIELDS.map((field) => [field, sqlText(project[field] ?? null)]),
  ...JSON_FIELDS.map((field) => [field, sqlJson(project[field] ?? [])]),
  ['team_size', String(project.team_size)],
  ['featured', project.featured ? 'true' : 'false'],
  ['order_index', String(project.order_index)],
  ['live_url', sqlText(project.live_url ?? null)],
  ['challenges', 'null'],
  ['learnings', 'null'],
  ['status', "'active'"],
];

const updateStatement = (project) => {
  const sets = columnValues(project).map(([column, value]) => `    ${column} = ${value}`);
  sets.push('    updated_at = now()');
  return [
    `  update public.projects set`,
    sets.join(',\n'),
    `  where title = ${sqlText(project.existing_title)};`,
    `  get diagnostics affected = row_count;`,
    `  if affected <> 1 then raise exception 'expected one row titled %, found %', ${sqlText(project.existing_title)}, affected; end if;`,
  ].join('\n');
};

const insertStatement = (project) => {
  const pairs = columnValues(project);
  return [
    `  if exists (select 1 from public.projects where title = ${sqlText(project.title)}) then`,
    `    raise exception 'project already exists: %', ${sqlText(project.title)};`,
    `  end if;`,
    `  insert into public.projects (${pairs.map(([column]) => column).join(', ')})`,
    `  values (${pairs.map(([, value]) => value).join(', ')});`,
  ].join('\n');
};

/** Builds the complete import script for a validated seed. */
export const buildImportSql = (seed) => {
  const projects = validateSeed(seed);
  const ordered = [...projects].sort((a, b) => a.order_index - b.order_index);
  const body = ordered.map((project) => {
    const kind = project.existing_title ? `update existing row "${project.existing_title}"` : 'insert new row';
    const statement = project.existing_title ? updateStatement(project) : insertStatement(project);
    return `  -- ${project.order_index}. ${project.title}: ${kind}\n${statement}`;
  });
  return [
    '-- Projects import generated by scripts/build-projects-import.mjs from supabase/seed/projects.json.',
    '-- Run once in the Supabase SQL editor after the awards migration. Applies all or nothing.',
    'do $$',
    'declare',
    '  affected integer;',
    '  active_count integer;',
    'begin',
    body.join('\n\n'),
    '',
    `  select count(*) into active_count from public.projects where status = 'active';`,
    `  if active_count <> ${projects.length} then`,
    `    raise exception 'expected ${projects.length} active projects after the import, found %', active_count;`,
    '  end if;',
    'end $$;',
    '',
  ].join('\n');
};
