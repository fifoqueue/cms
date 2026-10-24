/** Native links/details remain usable without this progressive enhancement. */
export const enhanceToc = (element: HTMLElement) => {
  const view = element.ownerDocument.defaultView!;
  type Target = { heading: HTMLElement; links: HTMLAnchorElement[] };
  let targets: Target[] = [];
  let groups = new Map<Element, Target[]>();
  let observer: IntersectionObserver | undefined;
  let offset = 10;
  const headers = [
    ...(
      element.closest('.cms-site') ?? element.ownerDocument
    ).querySelectorAll<HTMLElement>(
      'header, header .cms-sticky, .cms-sticky:has(header)',
    ),
  ];

  const active = () => {
    for (const [nav, items] of groups) {
      const passed = items.filter(
        (target) => target.heading.getBoundingClientRect().top <= offset + 1,
      );
      const current = passed.at(-1) ?? items[0];
      for (const target of items) {
        for (const link of target.links.filter((link) => nav.contains(link))) {
          if (target === current) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        }
      }
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
    observer?.disconnect();
    observer = new view.IntersectionObserver(active, {
      rootMargin: `-${offset}px 0px -60% 0px`,
      threshold: [0, 1],
    });
    targets.forEach(({ heading }) => observer!.observe(heading));
    active();
  };

  const prepare = () => {
    const links = [
      ...element.querySelectorAll<HTMLAnchorElement>('.cms-toc a[href^="#"]'),
    ];
    targets = [
      ...element.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'),
    ]
      .map((heading) => ({
        heading,
        links: links.filter(
          (link) =>
            link.getAttribute('href') === `#${heading.id}` ||
            link.getAttribute('href') === `#${encodeURIComponent(heading.id)}`,
        ),
      }))
      .filter((target) => target.links.length > 0);
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
    const heading = target.heading;
    const hadTabindex = heading.hasAttribute('tabindex');
    if (!hadTabindex) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    if (!hadTabindex)
      heading.addEventListener(
        'blur',
        () => heading.removeAttribute('tabindex'),
        { once: true },
      );
  };

  const mutations = new view.MutationObserver(prepare);
  const sizes = new view.ResizeObserver(measure);
  prepare();
  mutations.observe(element, { childList: true, subtree: true });
  headers.forEach((header) => sizes.observe(header));
  view.addEventListener('resize', measure);
  element.addEventListener('click', click);
  return {
    destroy() {
      mutations.disconnect();
      sizes.disconnect();
      observer?.disconnect();
      view.removeEventListener('resize', measure);
      element.removeEventListener('click', click);
      targets.forEach(({ links }) =>
        links.forEach((link) => link.removeAttribute('aria-current')),
      );
      element.style.removeProperty('--cms-toc-offset');
    },
  };
};
