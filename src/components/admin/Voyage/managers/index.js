// src/components/admin/Voyage/managers/index.js
//
// The registry of manager schemas by table. A chapter whose table has a
// schema here gets the deck and the sheet; the others keep their placeholder
// until their schema lands (Unit V3).

import { projectsSchema } from './projects.schema';

export const SCHEMAS = Object.freeze({ projects: projectsSchema });

export const schemaForTable = (table) => (table ? SCHEMAS[table] || null : null);
