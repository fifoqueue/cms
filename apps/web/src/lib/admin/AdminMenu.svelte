<script lang="ts">
  import { resolve } from '$app/paths';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import {
    FileText,
    Files,
    Image as ImageIcon,
    LayoutDashboard,
    MessageSquare,
    Palette,
    Pin,
    Plug,
    SearchCheck,
    Settings,
    Users,
    Wrench,
  } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import { can } from '@cms/sdk/capabilities';
  import type { Capability } from '@cms/sdk/capabilities';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { pluralLabel, useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';

  let {
    user,
    pluginPages,
    types = [],
    taxonomies = [],
    counts = { comments: 0, plugins: 0 },
  }: {
    user: { role: string; capabilities?: Capability[] };
    pluginPages: readonly { plugin: string; key: string; title: string }[];
    /** Content types, each with its own menu like wp-admin's Posts and Pages. */
    types?: readonly { key: string; pluralName: string; builtin: boolean }[];
    /** Custom taxonomies, listed under Posts after Tags. */
    taxonomies?: readonly { key: string; name: string }[];
    /** What needs attention: comments awaiting moderation, failed plugins. */
    counts?: { comments: number; plugins: number };
  } = $props();

  const i18n = useI18n();

  interface Entry {
    href: string;
    label: (m: Messages) => string;
    capability?: Capability;
    /** Content screens: the type they belong to. */
    type?: string;
  }

  interface Section {
    key: string;
    icon: Component;
    label: (m: Messages) => string;
    items: Entry[];
    /** Count bubble and its spoken text. */
    badge?: { count: number; label: (m: Messages) => string };
  }

  /** A content type's menu: its list and its new-entry screen. */
  const typeSection = (
    type: { key: string; pluralName: string; builtin: boolean },
    extra: Entry[] = [],
  ): Section => {
    const query: `?${string}` = `?type=${encodeURIComponent(type.key)}`;
    return {
      key: `type-${type.key}`,
      icon: type.key === 'page' ? Files : type.key === 'post' ? Pin : FileText,
      label: (m) => pluralLabel(m, type),
      items: [
        {
          href: resolve(`/admin/(app)/content${query}`),
          label: (m) => m.navAllOf(pluralLabel(m, type)),
          capability: 'content.create',
          type: type.key,
        },
        {
          href: resolve(`/admin/(app)/content/new${query}`),
          label: (m) => m.navAddNew,
          capability: 'content.create',
          type: type.key,
        },
        ...extra,
      ],
    };
  };

  /** Categories, tags and custom taxonomies sit under Posts, as in wp-admin. */
  const termEntries = $derived<Entry[]>([
    {
      href: resolve('/admin/(app)/categories'),
      label: (m) => m.navCategories,
      capability: 'taxonomy.manage',
    },
    {
      href: resolve('/admin/(app)/tags'),
      label: (m) => m.navTags,
      capability: 'taxonomy.manage',
    },
    ...taxonomies.map((taxonomy): Entry => ({
      href: resolve('/admin/(app)/taxonomies/[taxonomy]', {
        taxonomy: taxonomy.key,
      }),
      label: () => taxonomy.name,
      capability: 'taxonomy.manage',
    })),
  ]);

  /**
   * wp-admin style sections. Each entry is shown only to roles with its capability (none: every
   * signed-in user); a section is shown when any entry is, and its link opens the first one.
   */
  const sections = $derived.by((): Section[] => {
    const post = types.find((type) => type.key === 'post');
    const pages = types.find((type) => type.key === 'page');
    const others = types.filter(
      (type) => type.key !== 'post' && type.key !== 'page',
    );
    return [
      {
        key: 'dashboard',
        icon: LayoutDashboard,
        label: (m) => m.dashboard,
        items: [
          {
            href: resolve('/admin/(app)'),
            label: (m) => m.dashboard,
            capability: 'content.create',
          },
        ],
      },
      post
        ? typeSection(post, termEntries)
        : {
            key: 'content',
            icon: FileText,
            label: (m) => m.navContent,
            items: [
              {
                href: resolve('/admin/(app)/content'),
                label: (m) => m.navAllContent,
                capability: 'content.create',
              },
              ...termEntries,
            ],
          },
      {
        key: 'media',
        icon: ImageIcon,
        label: (m) => m.navMedia,
        items: [
          {
            href: resolve('/admin/(app)/media'),
            label: (m) => m.navMedia,
            capability: 'media.upload',
          },
        ],
      },
      ...(pages ? [typeSection(pages)] : []),
      ...others.map((type) => typeSection(type)),
      {
        key: 'comments',
        icon: MessageSquare,
        label: (m) => m.navComments,
        badge: {
          count: counts.comments,
          label: (m) => m.dashboardComments(counts.comments),
        },
        items: [
          {
            href: resolve('/admin/(app)/comments'),
            label: (m) => m.navComments,
            capability: 'comments.moderate',
          },
        ],
      },
      {
        key: 'appearance',
        icon: Palette,
        label: (m) => m.navAppearance,
        items: [
          {
            href: resolve('/admin/(app)/appearance'),
            label: (m) => m.appearanceThemes,
            capability: 'appearance.manage',
          },
          {
            href: resolve('/admin/(app)/appearance/editor'),
            label: (m) => m.navEditor,
            capability: 'appearance.manage',
          },
          {
            href: resolve('/admin/(app)/appearance/menus'),
            label: (m) => m.appearanceMenus,
            capability: 'appearance.manage',
          },
          {
            href: resolve('/admin/(app)/appearance/widgets'),
            label: (m) => m.appearanceWidgets,
            capability: 'appearance.manage',
          },
          {
            href: resolve('/admin/(app)/patterns'),
            label: (m) => m.patternsTitle,
            capability: 'content.create',
          },
        ],
      },
      {
        key: 'plugins',
        icon: Plug,
        label: (m) => m.navPlugins,
        badge: {
          count: counts.plugins,
          label: (m) => m.navPluginsFailed(counts.plugins),
        },
        items: [
          {
            href: resolve('/admin/(app)/plugins'),
            label: (m) => m.navPlugins,
            capability: 'plugins.manage',
          },
        ],
      },
      {
        key: 'users',
        icon: Users,
        label: (m) => m.navUsers,
        items: [
          {
            href: resolve('/admin/(app)/users'),
            label: (m) => m.navAllUsers,
            capability: 'users.manage',
          },
          { href: resolve('/admin/(app)/account'), label: (m) => m.navAccount },
        ],
      },
      {
        key: 'tools',
        icon: Wrench,
        label: (m) => m.navTools,
        items: [
          {
            href: resolve('/admin/(app)/tools/health'),
            label: (m) => m.toolsHealth,
            capability: 'tools.manage',
          },
          {
            href: resolve('/admin/(app)/tools/privacy/[action]', {
              action: 'export',
            }),
            label: (m) => m.privacyExport,
            capability: 'users.manage',
          },
          {
            href: resolve('/admin/(app)/tools/privacy/[action]', {
              action: 'erase',
            }),
            label: (m) => m.privacyErase,
            capability: 'users.manage',
          },
          {
            href: resolve('/admin/(app)/tools/transfer'),
            label: (m) => m.toolsTransfer,
            capability: 'tools.manage',
          },
          {
            href: resolve('/admin/(app)/tools/webhooks'),
            label: (m) => m.toolsWebhooks,
            capability: 'tools.manage',
          },
        ],
      },
      {
        key: 'seo',
        icon: SearchCheck,
        label: (m) => m.navSeo,
        items: [
          {
            href: resolve('/admin/(app)/seo'),
            label: (m) => m.navSeo,
            capability: 'settings.manage',
          },
        ],
      },
      {
        key: 'settings',
        icon: Settings,
        label: (m) => m.navSettings,
        // wp-admin order first, then this CMS's own screens.
        items: [
          {
            href: resolve('/admin/(app)/settings'),
            label: (m) => m.settingsGeneral,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/reading'),
            label: (m) => m.settingsReading,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/privacy'),
            label: (m) => m.privacySettings,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/discussion'),
            label: (m) => m.settingsDiscussion,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/permalinks'),
            label: (m) => m.permalinksTitle,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/email'),
            label: (m) => m.settingsEmail,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/search'),
            label: (m) => m.settingsSearch,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/security'),
            label: (m) => m.settingsSecurity,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/sign-in'),
            label: (m) => m.settingsSignIn,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/sso'),
            label: (m) => m.settingsSso,
            capability: 'settings.manage',
          },
          {
            href: resolve('/admin/(app)/settings/egress'),
            label: (m) => m.settingsEgress,
            capability: 'egress.manage',
          },
          {
            href: resolve('/admin/(app)/fields'),
            label: (m) => m.navFields,
            capability: 'fields.manage',
          },
        ],
      },
    ];
  });

  type Item = { href: string; label: string; type?: string };

  const menu = $derived(
    sections
      .map((section) => {
        const items: Item[] = section.items
          .filter((item) => !item.capability || can(user, item.capability))
          .map((item) => ({
            href: item.href,
            label: item.label(i18n.m),
            type: item.type,
          }));
        // Plugin pages are checked by the API, so they are listed as given.
        if (section.key === 'plugins')
          for (const { plugin, key, title } of pluginPages)
            items.push({
              href: resolve('/admin/(app)/extensions/[plugin]/[key]', {
                plugin,
                key,
              }),
              label: title,
            });
        const [first] = items;
        return {
          key: section.key,
          icon: section.icon,
          // A lone entry other than the section's own page names itself (an author's Account).
          label:
            items.length === 1 && first?.href !== section.items[0]?.href
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
      })
      .filter((section) => section.items.length > 0),
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
