// src/utils/printWindow.js
//
// Opens a popup, fills it through DOM APIs and prints it from the opener.
//
// The site's Content Security Policy allows no inline scripts, and a popup
// opened on about:blank inherits the opener's policy, so the old pattern of
// writing "<script>window.print()</script>" into the popup is blocked. The
// opener can call print() on the popup directly instead. Content is built
// with DOM methods, so values such as titles never pass through HTML parsing.

/** Upper bound on waiting for images before printing anyway. */
export const PRINT_IMAGE_TIMEOUT_MS = 3000;

/**
 * Resolves once every image in the document has loaded or failed, or after
 * the timeout, whichever comes first.
 */
const whenImagesSettled = (doc, timeoutMs) =>
  new Promise((resolve) => {
    const pending = Array.from(doc.images).filter((image) => !image.complete);
    if (pending.length === 0) {
      resolve();
      return;
    }
    let remaining = pending.length;
    const done = () => {
      remaining -= 1;
      if (remaining === 0) resolve();
    };
    pending.forEach((image) => {
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    });
    setTimeout(resolve, timeoutMs);
  });

/**
 * Opens a print window.
 *
 * @param {object} options
 * @param {string} options.title window title.
 * @param {string} [options.styles] CSS placed in a <style> element (inline
 *   styles are allowed by the policy; inline scripts are not).
 * @param {(doc: Document, body: HTMLElement) => void} options.render appends
 *   the printable content to `body` using DOM APIs.
 * @param {object} [deps] injectable for tests.
 * @param {(url: string, target: string) => Window|null} [deps.open] window opener.
 * @param {number} [deps.imageTimeoutMs] wait bound for images.
 * @returns {Promise<Window|null>} the popup, or null when the browser blocked it.
 */
export const openPrintWindow = async (
  { title, styles = '', render },
  { open = (url, target) => window.open(url, target), imageTimeoutMs = PRINT_IMAGE_TIMEOUT_MS } = {},
) => {
  const popup = open('', '_blank');
  if (!popup) {
    return null;
  }

  const doc = popup.document;
  doc.title = title;
  if (styles) {
    const style = doc.createElement('style');
    style.textContent = styles;
    doc.head.appendChild(style);
  }
  render(doc, doc.body);

  await whenImagesSettled(doc, imageTimeoutMs);
  popup.focus();
  popup.print();
  return popup;
};
