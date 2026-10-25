/** Moves focus to a heading a TOC link jumped to; the page scroll stays the link's own. */
export const focusHeading = (heading: HTMLElement) => {
  const hadTabindex = heading.hasAttribute('tabindex');
  if (!hadTabindex) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  if (!hadTabindex)
    heading.addEventListener(
      'blur',
      () => heading.removeAttribute('tabindex'),
      {
        once: true,
      },
    );
};

/** The element inside `root` a page-local `#fragment` link points at (raw or percent-encoded id). */
export const fragmentTarget = (href: string, root: Element) => {
  if (!href.startsWith('#')) return null;
  const raw = href.slice(1);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape is looked up as written.
  }
  const document = root.ownerDocument;
  const target =
    document.getElementById(decoded) ?? document.getElementById(raw);
  return target && root.contains(target) ? target : null;
};

/** Native links/details remain usable without this progressive enhancement. */
export const enhanceToc = (element: HTMLElement) => {
  const view = element.ownerDocument.defaultView!;
  type Target = { heading: HTMLElement; links: HTMLAnchorElement[] };
  let targets: Target[] = [];
  let groups = new Map<Element, Target[]>();
  /** Each TOC's marked target, so a frame writes `aria-current` only when it changes. */
  let marked = new Map<Element, Target | undefined>();
  let offset = 10;
  const headers = [
    ...(
      element.closest('.cms-site') ?? element.ownerDocument
    ).querySelectorAll<HTMLElement>(
      'header, header .cms-sticky, .cms-sticky:has(header)',
    ),
  ];

  const active = () => {
    // Reads first, once per heading: targets are in document order, so the first heading still
    // below the sticky-header line ends the passed run.
    const passed = new Set<Target>();
    for (const target of targets) {
      if (target.heading.getBoundingClientRect().top > offset + 1) break;
      passed.add(target);
    }
    // Then writes, only for TOCs whose current heading changed.
    for (const [nav, items] of groups) {
      const current =
        items.findLast((target) => passed.has(target)) ?? items[0];
      if (marked.has(nav) && marked.get(nav) === current) continue;
      for (const link of nav.querySelectorAll('a[aria-current]'))
        link.removeAttribute('aria-current');
      for (const link of current?.links ?? [])
        if (nav.contains(link)) link.setAttribute('aria-current', 'location');
      marked.set(nav, current);
    }
  };

  const measure = () => {
    // Computed CSS resolves rem/calc values, unlike parsing custom-property text.
    offset =
      Number.parseFloat(view.getComputedStyle(element).scrollMarginTop) || 10;
    for (const header of headers) {
      const style = view.getComputedStyle(header);
      if (style.position !== 'sticky' && style.position !== 'fixed') continue;
      const top = Number.parseFloat(style.top);
      if (Number.isFinite(top))
        offset = Math.max(
          offset,
          top + header.getBoundingClientRect().height + 10,
        );
    }
    element.style.setProperty('--cms-toc-offset', `${offset}px`);
    active();
  };

  // Every scroll, not heading intersections: a jump (link, Home/End) can skip a heading's band.
  let frame = 0;
  const scroll = () => {
    if (!frame)
      frame = view.requestAnimationFrame(() => {
        frame = 0;
        active();
      });
  };

  const prepare = () => {
    const links = [
      ...element.querySelectorAll<HTMLAnchorElement>('.cms-toc a[href^="#"]'),
    ];
    // Whatever the TOC links to (any heading level), one target per heading, in document order.
    const byHeading = new Map<HTMLElement, HTMLAnchorElement[]>();
    for (const link of links) {
      const heading = fragmentTarget(link.getAttribute('href')!, element);
      if (heading)
        byHeading.set(heading, [...(byHeading.get(heading) ?? []), link]);
    }
    targets = [...byHeading]
      .map(([heading, links]) => ({ heading, links }))
      .sort((a, b) =>
        a.heading.compareDocumentPosition(b.heading) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
    marked = new Map();
    groups = new Map(
      [...element.querySelectorAll('.cms-toc')].map((nav) => [
        nav,
        targets.filter((target) =>
          target.links.some((link) => nav.contains(link)),
        ),
      ]),
    );
    measure();
  };

  const click = (event: MouseEvent) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      '.cms-toc a',
    );
    if (
      !link ||
      !element.contains(link) ||
      link.hasAttribute('download') ||
      (link.target && link.target !== '_self')
    )
      return;
    const target = targets.find((item) => item.links.includes(link));
    if (!target) return;
    measure();
    focusHeading(target.heading);
  };

  const mutations = new view.MutationObserver(prepare);
  const sizes = new view.ResizeObserver(measure);
  prepare();
  mutations.observe(element, { childList: true, subtree: true });
  headers.forEach((header) => sizes.observe(header));
  view.addEventListener('resize', measure);
  view.addEventListener('scroll', scroll, { passive: true });
  element.addEventListener('click', click);
  return {
    destroy() {
      mutations.disconnect();
      sizes.disconnect();
      if (frame) view.cancelAnimationFrame(frame);
      view.removeEventListener('resize', measure);
      view.removeEventListener('scroll', scroll);
      element.removeEventListener('click', click);
      targets.forEach(({ links }) =>
        links.forEach((link) => link.removeAttribute('aria-current')),
      );
      element.style.removeProperty('--cms-toc-offset');
    },
  };
};
