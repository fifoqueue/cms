import { notifyFailure, notifySuccess } from '#lib/feedback.js';

/** Copy buttons of rendered code blocks; `copied` is the button's, `done` the toast's text. */
export const codeCopy = (
  element: HTMLElement,
  messages: { copy: string; copied: string; done: string; failed: string },
) => {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const prepare = () =>
    element
      .querySelectorAll<HTMLButtonElement>('[data-code-copy]')
      .forEach((button) => {
        button.hidden = false;
        if (!button.textContent) button.textContent = messages.copy;
        button.setAttribute(
          'aria-label',
          [
            messages.copy,
            button.closest('.cms-code')?.querySelector('figcaption')
              ?.textContent,
          ]
            .filter(Boolean)
            .join(': '),
        );
      });
  const observer = new MutationObserver(prepare);
  observer.observe(element, { childList: true, subtree: true });
  prepare();
  const click = async (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      '[data-code-copy]',
    );
    if (!button || !element.contains(button)) return;
    try {
      await navigator.clipboard.writeText(
        button.closest('.cms-code')?.querySelector('code')?.textContent ?? '',
      );
    } catch {
      notifyFailure(messages.failed);
      return;
    }
    // The toast announces the outcome; the button shows it briefly where the reader clicked.
    notifySuccess(messages.done);
    button.textContent = messages.copied;
    const timer = setTimeout(() => {
      button.textContent = messages.copy;
      timers.delete(timer);
    }, 2000);
    timers.add(timer);
  };
  element.addEventListener('click', click);
  return {
    destroy() {
      observer.disconnect();
      timers.forEach(clearTimeout);
      element.removeEventListener('click', click);
    },
  };
};
