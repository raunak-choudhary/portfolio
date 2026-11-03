// src/utils/quietConsole.js
//
// Side-effect module: silences verbose console output in production builds.
// Imported first in src/index.js because ES module imports are evaluated in
// order before any statement in the importing file runs; a plain function
// call in index.js would execute after every other module had already
// loaded and logged.

import { silenceVerboseConsoleInProduction } from './productionConsole';

silenceVerboseConsoleInProduction();
