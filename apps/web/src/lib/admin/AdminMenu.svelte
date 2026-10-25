<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { adminSections, visibleSections } from '#lib/admin/admin-nav.js';
  import type {
    NavContext,
    NavUser,
    PluginPage,
  } from '#lib/admin/admin-nav.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    user,
    pluginPages,
    types = [],
    taxonomies = [],
    counts = { comments: 0, plugins: 0 },
  }: NavContext & {
    user: NavUser;
    pluginPages: readonly PluginPage[];
  } = $props();

  const i18n = useI18n();

  /** Every section, before checking what the user may open (see `admin-nav.ts`). */
  const sections = $derived(adminSections({ types, taxonomies, counts }));

  const menu = $derived(
    visibleSections(sections, user, pluginPages).map((section) => {
      const items = section.items.map((item) => ({
        href: item.href,
        label: item.label(i18n.m),
        type: item.type,
      }));
      const [first] = items;
      const home = sections.find(({ key }) => key === section.key)?.items[0];
      return {
        key: section.key,
        icon: section.icon,
        // A lone entry other than the section's own page names itself (an author's Account).
        label:
          items.length === 1 && first?.href !== home?.href
            ? first.label
            : section.label(i18n.m),
        badge:
          section.badge && section.badge.count > 0
            ? {
                count: section.badge.count,
                label: section.badge.label(i18n.m),
              }
            : null,
        items,
      };
    }),
  );

  /** The content type of this screen: the list's or new screen's `type`, else the edited entry's. */
  const pageType = $derived(
    page.url.pathname.startsWith('/admin/content')
      ? (page.url.searchParams.get('type') ??
          (page.data as { entry?: { type?: string } }).entry?.type ??
          'post')
      : null,
  );

  /**
   * The entry for this page: the longest address that contains it (the Dashboard only matches
   * itself), and for content screens only the current type's entries.
   */
  const current = $derived.by(() => {
    const path = page.url.pathname;
    let best = '';
    let length = 0;
    for (const section of menu)
      for (const { href, type } of section.items) {
        const base = href.split('?')[0]!;
        const contains =
          path === base || (base !== '/admin' && path.startsWith(`${base}/`));
        if (
          contains &&
          (type === undefined || type === pageType) &&
          base.length + (type ? 1 : 0) > length
        ) {
          best = href;
          length = base.length + (type ? 1 : 0);
        }
      }
    return best;
  });

  /** The non-current section whose flyout is open (hover or keyboard focus). */
  let open = $state<string | null>(null);

  afterNavigate(() => {
    open = null;
  });

  const closeOnEscape = (event: KeyboardEvent, section: string) => {
    if (event.key !== 'Escape' || open !== section) return;
    // Focus first: moving focus to the section link reopens it through focusin.
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLElement>('[data-section-link]')
      ?.focus();
    open = null;
  };

  /**
   * Keeps an open flyout inside the window: when the space below its section runs out it moves
   * up by the difference, and a flyout taller than the window scrolls.
   */
  const fitWindow = (node: HTMLElement) => {
    if (!matchMedia('(min-width: 48rem)').matches) return;
    const margin = 8;
    node.style.maxHeight = `${innerHeight - margin * 2}px`;
    node.style.overflowY = 'auto';
    const { top, bottom } = node.getBoundingClientRect();
    const overflow = bottom - (innerHeight - margin);
    if (overflow > 0) node.style.top = `${-Math.min(overflow, top - margin)}px`;
    return () => {
      node.style.removeProperty('top');
      node.style.removeProperty('max-height');
      node.style.removeProperty('overflow-y');
    };
  };

  const closeOnBlur = (event: FocusEvent, section: string) => {
    const target = event.currentTarget as HTMLElement;
    if (open === section && !target.contains(event.relatedTarget as Node))
      open = null;
  };
</script>

<!-- Every href below comes from resolve() in the script. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<ul class="space-y-0.5">
  {#each menu as section (section.key)}
    {@const Icon = section.icon}
    {@const active = section.items.some((item) => item.href === current)}
    {@const nested = section.items.length > 1}
    {@const submenu = `admin-menu-${section.key}`}
    <!-- Hover and focus only reveal links that stay reachable by Tab; Escape closes. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <li
      class="relative"
      onmouseenter={() => {
        if (nested && !active) open = section.key;
      }}
      onmouseleave={() => {
        if (open === section.key) open = null;
      }}
      onfocusin={() => {
        if (nested && !active) open = section.key;
      }}
      onfocusout={(event) => closeOnBlur(event, section.key)}
      onkeydown={(event) => closeOnEscape(event, section.key)}
    >
      <a
        data-section-link
        href={section.items[0].href}
        aria-current={active ? (nested ? 'true' : 'page') : undefined}
        data-active={active || undefined}
        aria-controls={nested && !active ? submenu : undefined}
        aria-expanded={nested && !active ? open === section.key : undefined}
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground data-active:bg-muted data-active:font-medium data-active:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        <Icon class="size-4 shrink-0" />
        {section.label}
        {#if section.badge}
          <Badge variant="destructive" class="ml-auto"
            ><span aria-hidden="true">{section.badge.count}</span><span
              class="sr-only">{section.badge.label}</span
            ></Badge
          >
        {/if}
      </a>
      {#if nested}
        <ul
          id={submenu}
          class={[
            'mt-0.5 mb-1 ml-5 space-y-0.5 border-l pl-2',
            !active &&
              (open === section.key
                ? 'md:absolute md:top-0 md:left-full md:z-50 md:mt-0 md:ml-0 md:min-w-48 md:rounded-md md:border md:bg-popover md:p-1 md:text-popover-foreground md:shadow-md md:duration-150 md:animate-in md:fade-in-0 md:slide-in-from-left-1'
                : 'md:hidden'),
          ]}
          {@attach !active && open === section.key ? fitWindow : undefined}
        >
          {#each section.items as item (item.href)}
            <li>
              <a
                href={item.href}
                aria-current={item.href === current ? 'page' : undefined}
                class="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >{item.label}</a
              >
            </li>
          {/each}
        </ul>
      {/if}
    </li>
  {/each}
</ul>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
