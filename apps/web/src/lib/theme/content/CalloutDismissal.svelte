<script lang="ts">
  import { useI18n } from '#lib/i18n/index.js';
  import '#lib/theme/content/callout.css';

  /**
   * Callouts inside `container` (the entry's prose) get their variant as accessible name, and
   * dismissible ones a working close button. `html` re-runs this when the entry changes.
   */
  let {
    container,
    html,
  }: { container: HTMLElement | undefined; html: string } = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);

  const visible = (element: Element | null, step: 'next' | 'previous') => {
    while (element instanceof HTMLElement && element.hidden)
      element =
        step === 'next'
          ? element.nextElementSibling
          : element.previousElementSibling;
    return element instanceof HTMLElement ? element : null;
  };

  /** Focus that does not otherwise stop on `target` lasts only until it leaves again. */
  const focus = (target: HTMLElement) => {
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
      target.addEventListener(
        'blur',
        () => target.removeAttribute('tabindex'),
        {
          once: true,
        },
      );
    }
    target.focus({ preventScroll: true });
  };

  /** Hides only this callout until the page is loaded again, and keeps keyboard focus nearby. */
  const dismiss = (event: MouseEvent) => {
    const callout = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      '.cms-callout',
    );
    if (!callout) return;
    callout.hidden = true;
    const target =
      visible(callout.nextElementSibling, 'next') ??
      visible(callout.previousElementSibling, 'previous') ??
      callout.parentElement;
    if (target) focus(target);
  };

  $effect(() => {
    void html;
    if (!container) return;
    for (const callout of container.querySelectorAll<HTMLElement>(
      '.cms-callout',
    )) {
      const variant = /(?:^|\s)cms-callout-([a-z]+)(?=\s|$)/.exec(
        callout.className,
      )?.[1];
      if (variant)
        callout.setAttribute(
          'aria-label',
          m.contentCalloutVariantName(variant),
        );
    }
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '.cms-callout-close[hidden]',
    )) {
      button.setAttribute('aria-label', m.themeCalloutDismiss);
      button.addEventListener('click', dismiss);
      button.hidden = false;
    }
  });
</script>
