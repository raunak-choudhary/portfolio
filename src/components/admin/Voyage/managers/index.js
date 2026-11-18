// src/components/admin/Voyage/managers/index.js
//
// The registry of manager schemas by table. A chapter whose table has a
// schema here gets its manager (a deck, or the read panel for a singleton);
// the others keep their placeholder until their schema lands. Adding a
// manager is one schema file plus one line here (see ./README.md).

import { aboutSchema } from './about.schema';
import { heroSchema } from './hero.schema';
import { projectsSchema } from './projects.schema';
import { skillsSchema } from './skills.schema';

export const SCHEMAS = Object.freeze({
  hero_content: heroSchema,
  about_content: aboutSchema,
  projects: projectsSchema,
  skills: skillsSchema,
});

export const schemaForTable = (table) => (table ? SCHEMAS[table] || null : null);
