<script lang="ts">
  import { useI18n } from '#lib/i18n/index.js';
  import { focusHeading, fragmentTarget } from '#lib/theme/content/toc.js';
  import '#lib/theme/content/footnotes.css';

  /**
   * Footnotes rendered by `renderWithToc` inside `container` (the entry's prose): localized
   * labels, a subtle heading for each page's list, and a popover with the note's text next to
   * its reference on hover (mouse), keyboard focus or tap. A tap opens the popover instead of
   * jumping; a second tap, or the popover's link, still jumps to the list. Without this, refs
   * and back-links are plain fragment links. `html` re-runs this when the entry changes.
   *
   * The renderer already grouped named notes: every ref and back-link carries its
   * `data-footnote-label`, and refs of one name point at the same list item, whose direct child
   * `span` holds the shared text. Nothing is regrouped or renumbered here.
   */
  let {
    container,
    html,
  }: { container: HTMLElement | undefined; html: string } = $props();

  type Via = 'hover' | 'focus' | 'tap';
  type Open = {
    ref: HTMLAnchorElement;
    href: string;
    label: string;
    text: string;
    via: Via;
  };

  const REF = 'a[data-footnote-ref]';
  const BACK = 'a[data-footnote-back]';
  /** A short highlight on the element a footnote link landed on (footnotes.css). */
  const FLASH = 'data-footnote-flash';
  /** Space between the ref and the popover, and the popover and the viewport edges. */
  const GAP = 6;
  const EDGE = 8;
  /** Lets the pointer travel from the ref to the popover (WCAG 1.4.13 "hoverable"). */
  const HOVER_GRACE = 200;

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $props.id();
  const popoverId = `${id}-popover`;

  let active = $state.raw<Open | null>(null);
  let popover = $state<HTMLElement>();
  let place = $state({ top: 0, left: 0, side: 'above' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Set while focus returns to a ref programmatically, so that focus does not reopen it. */
  let quiet = false;

  const labelOf = (link: HTMLElement) => link.dataset.footnoteLabel ?? '';
  const noteText = (href: string, root: HTMLElement) =>
    fragmentTarget(href, root)?.querySelector(':scope > span') ?? null;

  const cancel = () => clearTimeout(timer);

  /** Restarts the highlight, so landing on the same note twice still shows it. */
  const flash = (element: HTMLElement) => {
    const view = element.ownerDocument.defaultView!;
    if (!view.matchMedia('(prefers-reduced-motion: no-preference)').matches)
      return;
    element.removeAttribute(FLASH);
    void element.offsetWidth;
    element.setAttribute(FLASH, '');
    element.addEventListener(
      'animationend',
      () => element.removeAttribute(FLASH),
      { once: true },
    );
  };

  /**
   * Focus follows a footnote jump (the link scrolls natively; scroll-margin clears sticky
   * headers). Landing on a reference focuses its link without reopening its popover.
   */
  const land = (target: HTMLElement) => {
    const ref = target.querySelector<HTMLAnchorElement>(REF);
    if (ref) {
      quiet = true;
      ref.focus({ preventScroll: true });
      quiet = false;
    } else focusHeading(target);
    flash(ref ?? target);
  };

  const hide = () => {
    cancel();
    if (!active) return;
    active.ref.setAttribute('aria-expanded', 'false');
    active.ref.removeAttribute('aria-controls');
    active = null;
  };

  /** The ref or the popover holds keyboard focus or the mouse pointer. */
  const engaged = () => {
    if (!active) return false;
    const focused = active.ref.ownerDocument.activeElement;
    return (
      active.ref.matches(':hover') ||
      popover?.matches(':hover') === true ||
      (!!focused &&
        (active.ref.contains(focused) || popover?.contains(focused) === true))
    );
  };

  /** A hover popover closes after the grace period unless it is still engaged. */
  const later = () => {
    cancel();
    timer = setTimeout(() => {
      if (!engaged()) hide();
    }, HOVER_GRACE);
  };

  const show = (ref: HTMLAnchorElement, via: Via) => {
    cancel();
    if (!container) return;
    const href = ref.getAttribute('href') ?? '';
    // Text only: the note's markup is never copied into the popover.
    const text = noteText(href, container)?.textContent?.trim() ?? '';
    if (!text) return;
    if (active && active.ref !== ref) {
      active.ref.setAttribute('aria-expanded', 'false');
      active.ref.removeAttribute('aria-controls');
    }
    ref.setAttribute('aria-expanded', 'true');
    ref.setAttribute('aria-controls', popoverId);
    active = { ref, href, label: labelOf(ref), text, via };
  };

  /**
   * Above the ref when it fits below the sticky headers, else below, else on the roomier side
   * with its height capped to that room (the content scrolls); always kept between the sticky
   * headers and the viewport's bottom. Closes once the ref has scrolled fully out of view.
   */
  const position = () => {
    if (!active || !popover) return;
    const document = popover.ownerDocument;
    const view = document.defaultView!;
    const rect = active.ref.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = view.innerHeight;
    const ceiling = container
      ? Number.parseFloat(
          view.getComputedStyle(container).getPropertyValue('--cms-toc-offset'),
        ) || EDGE
      : EDGE;
    const floor = viewportHeight - EDGE;
    if (rect.bottom <= ceiling || rect.top >= viewportHeight) {
      hide();
      return;
    }
    // The full height before any room cap: content plus borders.
    const natural =
      popover.scrollHeight + popover.offsetHeight - popover.clientHeight;
    const roomAbove = rect.top - GAP - ceiling;
    const roomBelow = floor - rect.bottom - GAP;
    const side =
      natural <= roomAbove || (natural > roomBelow && roomAbove > roomBelow)
        ? 'above'
        : 'below';
    popover.style.setProperty(
      '--cms-footnote-room',
      `${Math.max(side === 'above' ? roomAbove : roomBelow, 48)}px`,
    );
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const top = side === 'above' ? rect.top - GAP - height : rect.bottom + GAP;
    place = {
      top: Math.max(ceiling, Math.min(top, floor - height)),
      left: Math.min(
        Math.max(EDGE, rect.left + rect.width / 2 - width / 2),
        Math.max(EDGE, viewportWidth - EDGE - width),
      ),
      side,
    };
  };

  /** Labels, ids and listeners for the footnotes of the rendered page. */
  $effect(() => {
    void html;
    const element = container;
    if (!element) return;
    const refs = [...element.querySelectorAll<HTMLAnchorElement>(REF)];
    const sections = [
      ...element.querySelectorAll<HTMLElement>('.cms-footnotes'),
    ];
    if (!refs.length && !sections.length) return;

    for (const ref of refs) {
      const href = ref.getAttribute('href') ?? '';
      ref.setAttribute('aria-label', m.themeFootnoteRef(labelOf(ref)));
      ref.setAttribute('aria-expanded', 'false');
      const text = noteText(href, element);
      const note = text?.parentElement;
      if (!text || !note?.id) continue;
      text.id ||= `${note.id}-text`;
      ref.setAttribute('aria-describedby', text.id);
    }
    const titles = sections.map((section, index) => {
      const title = element.ownerDocument.createElement('h2');
      title.className = 'cms-footnotes-title';
      title.id = `${id}-title-${index}`;
      title.textContent = m.themeFootnotes;
      section.prepend(title);
      section.setAttribute('aria-labelledby', title.id);
      for (const back of section.querySelectorAll<HTMLAnchorElement>(BACK))
        back.setAttribute('aria-label', m.themeFootnoteBack(labelOf(back)));
      return title;
    });

    let pointer = '';
    const pointerdown = (event: PointerEvent) => {
      pointer = event.pointerType;
    };
    const refFrom = (event: Event) => {
      const ref =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>(REF)
          : null;
      return ref && element.contains(ref) ? ref : null;
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const ref = refFrom(event);
      if (!ref) return;
      if (active?.ref === ref) cancel();
      else show(ref, 'hover');
    };
    const out = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || active?.via !== 'hover') return;
      if (refFrom(event) !== active.ref) return;
      const next = event.relatedTarget;
      if (
        next instanceof Node &&
        (active.ref.contains(next) || popover?.contains(next))
      )
        return;
      later();
    };
    const focusin = (event: FocusEvent) => {
      const ref = refFrom(event);
      if (ref && !quiet && ref.matches(':focus-visible')) show(ref, 'focus');
    };
    const focusout = (event: FocusEvent) => {
      if (active?.via !== 'focus' || event.target !== active.ref) return;
      const next = event.relatedTarget;
      if (next instanceof Node && popover?.contains(next)) return;
      hide();
    };
    const click = (event: MouseEvent) => {
      const via = pointer;
      pointer = '';
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link || !element.contains(link)) return;
      const href = link.getAttribute('href')!;
      if (link.matches(REF)) {
        const touch = via === 'touch' || via === 'pen';
        if (touch && !(active?.ref === link && active.via === 'tap')) {
          event.preventDefault();
          show(link, 'tap');
          return;
        }
        hide();
      } else if (!link.closest('.cms-footnotes')) return;
      const target = fragmentTarget(href, element);
      if (target) land(target);
    };

    element.addEventListener('pointerdown', pointerdown);
    element.addEventListener('pointerover', over);
    element.addEventListener('pointerout', out);
    element.addEventListener('focusin', focusin);
    element.addEventListener('focusout', focusout);
    element.addEventListener('click', click);
    return () => {
      cancel();
      element.removeEventListener('pointerdown', pointerdown);
      element.removeEventListener('pointerover', over);
      element.removeEventListener('pointerout', out);
      element.removeEventListener('focusin', focusin);
      element.removeEventListener('focusout', focusout);
      element.removeEventListener('click', click);
      titles.forEach((title) => title.remove());
      // A re-run (language change) labels these refs again; none stays expanded or controlling.
      for (const ref of refs) {
        ref.removeAttribute('aria-expanded');
        ref.removeAttribute('aria-controls');
        ref.removeAttribute('aria-describedby');
      }
      active = null;
    };
  });

  /** While open: Escape and outside presses close it; scrolling and resizing keep it placed. */
  $effect(() => {
    const current = active;
    if (!current || !popover) return;
    const view = popover.ownerDocument.defaultView!;
    position();
    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = view.requestAnimationFrame(() => {
          frame = 0;
          position();
        });
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const inside = popover?.contains(view.document.activeElement) === true;
      hide();
      if (!inside) return;
      quiet = true;
      current.ref.focus();
      quiet = false;
    };
    const pointerdown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (current.ref.contains(target) || popover?.contains(target))
      )
        return;
      hide();
    };
    view.addEventListener('keydown', keydown);
    view.addEventListener('pointerdown', pointerdown, true);
    view.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule, { passive: true });
    return () => {
      view.removeEventListener('keydown', keydown);
      view.removeEventListener('pointerdown', pointerdown, true);
      view.removeEventListener('scroll', schedule);
      view.removeEventListener('resize', schedule);
      if (frame) view.cancelAnimationFrame(frame);
    };
  });

  const enter = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') cancel();
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || active?.via !== 'hover') return;
    const next = event.relatedTarget;
    if (next instanceof Node && active.ref.contains(next)) return;
    later();
  };
  const focusout = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      (popover?.contains(next) || active?.ref.contains(next))
    )
      return;
    hide();
  };
  const jump = (event: MouseEvent) => {
    const href = active?.href ?? '';
    const root = container;
    hide();
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      !root
    )
      return;
    const target = fragmentTarget(href, root);
    if (target) land(target);
  };
</script>

{#if active}
  <div
    bind:this={popover}
    id={popoverId}
    role="note"
    aria-label={m.themeFootnoteRef(active.label)}
    class="cms-footnote-popover"
    data-side={place.side}
    style:top="{place.top}px"
    style:left="{place.left}px"
    onpointerenter={enter}
    onpointerleave={leave}
    onfocusout={focusout}
  >
    <p>
      <span class="cms-footnote-popover-label" aria-hidden="true"
        >[{active.label}]</span
      >
      {active.text}
    </p>
    <!-- eslint-disable svelte/no-navigation-without-resolve -- the page-local "#fn-…" fragment of the ref -->
    <a href={active.href} onclick={jump}>{m.themeFootnoteJump(active.label)}</a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </div>
{/if}
