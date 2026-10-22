<script lang="ts">
  import { resolve } from '$app/paths';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import {
    FileText,
    Image as ImageIcon,
    LayoutDashboard,
    MessageSquare,
    Palette,
    Plug,
    SearchCheck,
    Settings,
    Users,
    Wrench,
  } from '@lucide/svelte';
  import { can } from '@cms/sdk/capabilities';
  import type { Capability } from '@cms/sdk/capabilities';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';

  let {
    user,
    pluginPages,
  }: {
    user: { role: string; capabilities?: Capability[] };
    pluginPages: readonly { plugin: string; key: string; title: string }[];
  } = $props();

  const i18n = useI18n();

  /**
   * wp-admin style sections. Each entry is shown only to roles with its capability (none: every
   * signed-in user); a section is shown when any entry is, and its link opens the first one.
   */
  const sections = [
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
    {
      key: 'content',
      icon: FileText,
      label: (m) => m.navContent,
      items: [
        {
          href: resolve('/admin/(app)/content'),
          label: (m) => m.navAllContent,
          capability: 'content.create',
        },
        {
          href: resolve('/admin/(app)/content/new'),
          label: (m) => m.navAddNew,
          capability: 'content.create',
        },
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
        {
          href: resolve('/admin/(app)/fields'),
          label: (m) => m.navFields,
          capability: 'fields.manage',
        },
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
    {
      key: 'comments',
      icon: MessageSquare,
      label: (m) => m.navComments,
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
      ],
    },
    {
      key: 'plugins',
      icon: Plug,
      label: (m) => m.navPlugins,
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
          href: resolve('/admin/(app)/settings/discussion'),
          label: (m) => m.settingsDiscussion,
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
          href: resolve('/admin/(app)/settings/sso'),
          label: (m) => m.settingsSso,
          capability: 'settings.manage',
        },
      ],
    },
  ] as const satisfies readonly {
    key: string;
    icon: unknown;
    label: (m: Messages) => string;
    items: readonly {
      href: string;
      label: (m: Messages) => string;
      capability?: Capability;
    }[];
  }[];

  type Item = { href: string; label: string };

  const menu = $derived(
    sections
      .map((section) => {
        const items: Item[] = section.items
          .filter(
            (item) => !('capability' in item) || can(user, item.capability),
          )
          .map((item) => ({ href: item.href, label: item.label(i18n.m) }));
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
            items.length === 1 && first?.href !== section.items[0].href
              ? first.label
              : section.label(i18n.m),
          items,
        };
      })
      .filter((section) => section.items.length > 0),
  );

  /** The entry for this page: the longest address that contains it. */
  const current = $derived.by(() => {
    const path = page.url.pathname;
    let best = '';
    for (const section of menu)
      for (const { href } of section.items)
        if (
          href.length > best.length &&
          (path === href || path.startsWith(`${href}/`))
        )
          best = href;
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
