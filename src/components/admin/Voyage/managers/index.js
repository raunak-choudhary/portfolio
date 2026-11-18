// src/components/admin/Voyage/managers/index.js
//
// The registry of manager schemas by table. A chapter whose table has a
// schema here gets its manager (a deck, or the read panel for a singleton);
// the others (media, inbox) keep their placeholder until their unit lands. Adding a
// manager is one schema file plus one line here (see ./README.md).

import { aboutSchema } from './about.schema';
import { achievementsSchema } from './achievements.schema';
import { certificationsSchema } from './certifications.schema';
import { educationSchema } from './education.schema';
import { heroSchema } from './hero.schema';
import { internshipsSchema } from './internships.schema';
import { leadershipSchema } from './leadership.schema';
import { projectsSchema } from './projects.schema';
import { recommendationsSchema } from './recommendations.schema';
import { skillsSchema } from './skills.schema';
import { workExperienceSchema } from './workExperience.schema';

export const SCHEMAS = Object.freeze({
  hero_content: heroSchema,
  about_content: aboutSchema,
  projects: projectsSchema,
  skills: skillsSchema,
  education: educationSchema,
  work_experience: workExperienceSchema,
  internships: internshipsSchema,
  certifications: certificationsSchema,
  achievements: achievementsSchema,
  leadership: leadershipSchema,
  recommendations: recommendationsSchema,
});

export const schemaForTable = (table) => (table ? SCHEMAS[table] || null : null);
