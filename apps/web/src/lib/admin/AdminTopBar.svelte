<script lang="ts">
  import { resolve } from '$app/paths';
  import { can } from '@cms/sdk/capabilities';
  import type { Capability } from '@cms/sdk/capabilities';
  import {
    ChevronDown,
    ExternalLink,
    MessageSquare,
    Plus,
    UserRound,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { typeLabel, useI18n } from '#lib/i18n/index.js';

  interface Props {
    user: { name: string; role: string; capabilities?: readonly Capability[] };
    siteTitle: string;
    /** Comments waiting for moderation (0 when the user may not moderate). */
    pendingComments: number;
  }

  let { user, siteTitle, pendingComments }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const newItems = $derived(
    [
      {
        href: resolve('/admin/(app)/content/new?type=post'),
        label: typeLabel(m, 'post'),
        capability: 'content.create',
      },
      {
        href: resolve('/admin/(app)/content/new?type=page'),
        label: typeLabel(m, 'page'),
        capability: 'content.create',
      },
      {
        href: resolve('/admin/(app)/media'),
        label: m.navMedia,
        capability: 'media.upload',
      },
      {
        href: `${resolve('/admin/(app)/users')}#name`,
        label: m.newUser,
        capability: 'users.manage',
      },
    ].filter((item) => can(user, item.capability as Capability)),
  );

  // Tabs read "Page ‹ Site — CMS" like wp-admin; pages keep setting only their own name.
  onMount(() => {
    const suffix = ` ‹ ${siteTitle} — CMS`;
    const apply = () => {
      if (document.title && !document.title.endsWith(suffix))
        document.title += suffix;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  });

  /** Menus close when the pointer or focus goes elsewhere. */
  const closeMenus = (event: Event) => {
    for (const menu of document.querySelectorAll<HTMLDetailsElement>(
      'details[data-top-menu][open]',
    ))
      if (!menu.contains(event.target as Node)) menu.open = false;
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const menu = (event.target as HTMLElement).closest<HTMLDetailsElement>(
      'details[data-top-menu]',
    );
    if (!menu?.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  };

  const menu =
    'absolute z-50 mt-1 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md';
  const item =
    'block rounded px-3 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted';
</script>

<svelte:window onclick={closeMenus} onfocusin={closeMenus} />

<!-- eslint-disable svelte/no-navigation-without-resolve -- every href comes from resolve() above -->
<!-- Escape closes the open menu inside the toolbar. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<nav
  aria-label={m.adminToolbar}
  class="flex flex-wrap items-center gap-1 border-b bg-background px-4 py-1.5 text-sm"
  onkeydown={closeOnEscape}
>
  <a
    href={resolve('/(site)')}
    class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-medium hover:bg-muted"
    >{siteTitle}<ExternalLink class="size-3.5" aria-hidden="true" /><span
      class="sr-only">({m.viewSite})</span
    ></a
  >
  {#if can(user, 'comments.moderate')}
    <a
      href={resolve('/admin/(app)/comments?status=pending')}
      class="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
      title={m.commentsAwaiting(pendingComments)}
      ><MessageSquare class="size-4" aria-hidden="true" /><span
        aria-hidden="true">{pendingComments}</span
      ><span class="sr-only">{m.commentsAwaiting(pendingComments)}</span></a
    >
  {/if}
  {#if newItems.length}
    <details data-top-menu class="relative">
      <summary
        class="inline-flex cursor-pointer list-none items-center gap-1 rounded px-2 py-1 hover:bg-muted"
        ><Plus class="size-4" aria-hidden="true" />{m.topNew}</summary
      >
      <ul class={menu}>
        {#each newItems as entry (entry.href)}
          <li><a href={entry.href} class={item}>{entry.label}</a></li>
        {/each}
      </ul>
    </details>
  {/if}
  <details data-top-menu class="relative ml-auto">
    <summary
      class="inline-flex cursor-pointer list-none items-center gap-1 rounded px-2 py-1 hover:bg-muted"
      ><UserRound class="size-4" aria-hidden="true" />{user.name}<ChevronDown
        class="size-3.5"
        aria-hidden="true"
      /></summary
    >
    <ul class="{menu} right-0">
      <li>
        <a href={resolve('/admin/(app)/account')} class={item}>{m.navAccount}</a
        >
      </li>
      <li>
        <form method="POST" action={resolve('/admin/logout')}>
          <button type="submit" class="{item} w-full text-left"
            >{m.signOut}</button
          >
        </form>
      </li>
    </ul>
  </details>
</nav>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
