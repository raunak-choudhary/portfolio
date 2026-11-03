// e2e/support/page-probe.mjs
//
// Shared page handling for the browser suite: theme preset, error capture,
// a deterministic "ready" point, and the layout record a capture stores.

/** Stylesheet that freezes CSS motion so layout reads are stable. */
const FREEZE_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

/**
 * Presets the theme before any page script runs, using the same storage key
 * ThemeContext reads, so the first render is already in the right theme.
 */
export async function presetTheme(context, theme) {
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem('portfolio-theme', value);
    } catch {
      // Storage can be blocked; the app then falls back to its default theme.
    }
  }, theme);
}

/**
 * Starts collecting console errors, uncaught exceptions and failed responses
 * for a page. Returns the live array the listeners append to.
 */
export function collectPageErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`[http ${response.status()}] ${response.request().method()} ${response.url()}`);
  });
  return errors;
}

/**
 * Waits until the page has rendered and settled:
 *   - `body.loaded` is set (the page is visibility:hidden until then);
 *   - an <h1> exists, proving React rendered real content, not an empty shell;
 *   - the network is idle (bounded, since realtime sockets never close);
 *   - CSS motion is frozen and fonts have loaded.
 */
export async function waitForPageReady(page, { networkIdleTimeout = 10_000 } = {}) {
  await page.waitForSelector('body.loaded', { state: 'attached', timeout: 15_000 });
  await page.waitForSelector('h1', { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: networkIdleTimeout }).catch(() => {});
  await page.addStyleTag({ content: FREEZE_MOTION_CSS });
  await page.evaluate(() => document.fonts?.ready);
  // One frame for layout to settle after motion is frozen.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

/**
 * Reads the layout record for the current page. Runs in the browser.
 * The style probe samples colours and fonts of a few stable landmarks so a
 * capture comparison catches theme or font regressions that do not change
 * layout.
 */
export async function readLayoutRecord(page) {
  const record = await page.evaluate(() => {
    const root = document.documentElement;
    const probe = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontFamily: style.fontFamily,
      };
    };
    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .filter((element) => element.offsetParent !== null || element.getClientRects().length > 0)
      .map((element) => `${element.tagName.toLowerCase()}: ${element.innerText.trim().replace(/\s+/g, ' ')}`)
      .filter((text) => !text.endsWith(': '));

    return {
      title: document.title,
      theme: root.getAttribute('data-theme'),
      documentHeight: root.scrollHeight,
      documentWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      headings,
      style: {
        body: probe('body'),
        header: probe('header'),
        firstHeading: probe('h1'),
        firstCard: probe('[class*="card"]'),
      },
    };
  });

  const main = page.locator('main').first();
  record.ariaSnapshot = (await main.count()) ? await main.ariaSnapshot() : '';
  return record;
}
