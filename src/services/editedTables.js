// src/services/editedTables.js
//
// The content tables the admin edits, with the section label shown for each
// and the column that names a record. Kept apart from voyageData (which
// opens the Supabase client) so pure modules, such as the activity model,
// can read the labels without a network client.

/** [table, section label, label column] for every content table with updated_at. */
export const EDITED_TABLES = Object.freeze([
  ['hero_content', 'Hero', 'title'], ['about_content', 'About', 'about_me_title'], ['projects', 'Projects', 'title'], ['internships', 'Internships', 'company'],
  ['education', 'Education', 'institution'], ['work_experience', 'Work', 'company'], ['skills', 'Skills', 'skill_name'], ['certifications', 'Certifications', 'title'],
  ['recommendations', 'Recommendations', 'recommender_name'], ['achievements', 'Achievements', 'title'], ['leadership', 'Leadership', 'title'],
]);
