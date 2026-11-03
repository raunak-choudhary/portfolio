import { openPrintWindow } from './printWindow';

/** A popup double backed by a real jsdom document, so DOM APIs behave. */
const createPopup = () => {
  const doc = document.implementation.createHTMLDocument('');
  return { document: doc, focus: jest.fn(), print: jest.fn() };
};

describe('openPrintWindow', () => {
  it('fills the popup through DOM APIs and prints without any inline script', async () => {
    const popup = createPopup();

    await openPrintWindow(
      {
        title: 'Print <Certificate>',
        styles: 'body { margin: 0 }',
        render: (doc, body) => {
          const heading = doc.createElement('h1');
          heading.textContent = 'AWS <Cloud> Practitioner';
          body.appendChild(heading);
        },
      },
      { open: () => popup },
    );

    expect(popup.document.title).toBe('Print <Certificate>');
    expect(popup.document.head.querySelector('style').textContent).toBe('body { margin: 0 }');
    expect(popup.document.body.querySelector('h1').textContent).toBe('AWS <Cloud> Practitioner');
    expect(popup.document.querySelector('script')).toBeNull();
    expect(popup.focus).toHaveBeenCalledTimes(1);
    expect(popup.print).toHaveBeenCalledTimes(1);
  });

  it('waits for images before printing, with a bounded timeout', async () => {
    jest.useFakeTimers();
    const popup = createPopup();

    const printing = openPrintWindow(
      {
        title: 'Image',
        render: (doc, body) => {
          const image = doc.createElement('img');
          image.src = 'https://example.test/certificate.png';
          body.appendChild(image);
        },
      },
      { open: () => popup, imageTimeoutMs: 500 },
    );

    expect(popup.print).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    await printing;

    expect(popup.print).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('returns null and does nothing when the popup is blocked', async () => {
    const render = jest.fn();

    const result = await openPrintWindow({ title: 'Blocked', render }, { open: () => null });

    expect(result).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });
});
