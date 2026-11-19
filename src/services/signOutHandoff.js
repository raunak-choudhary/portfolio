// src/services/signOutHandoff.js
//
// "Sign out everywhere" ends the session before the page moves to the
// sign-out film. Ending it fires Supabase's SIGNED_OUT event at once, and the
// dashboard route would answer that by sending the browser to the login page
// while the film's page load is starting. While a hand-off is open the route
// holds a dark screen instead, so the film is what the owner sees.
//
// Kept in module memory on purpose: the full page load to /adminsignout
// clears it, so a stale hand-off can never hide the login page later.

let handoff = false;

/** Opens the hand-off: call just before ending the session on the way to the film. */
export const beginFilmHandoff = () => { handoff = true; };

/** Closes it again: call when ending the session failed and the page stays. */
export const cancelFilmHandoff = () => { handoff = false; };

/** True while the page is on its way to the sign-out film. */
export const isFilmHandoff = () => handoff;
