<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    Eye,
    LayoutDashboard,
    LogOut,
    Paintbrush,
    Pencil,
    Plus,
    UserRound,
  } from '@lucide/svelte';
  import type { Capability, Role } from '@cms/sdk';
  import { can } from '@cms/sdk/capabilities';
  import { clearBackups } from '#lib/admin/editor-backup.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    user: { name: string | null; role: Role; capabilities?: Capability[] };
    siteTitle: string;
    /** Name of the theme being previewed, if any. */
    previewing: string | null;
  }

  let { user, siteTitle, previewing }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  /** The entry this page shows, for the edit link. */
  const entry = $derived.by(() => {
    const data = page.data as { kind?: string; content?: { id: string } };
    return data.kind === 'content' && data.content ? data.content : null;
  });
  const item =
    'flex h-full items-center gap-1.5 px-2.5 text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none';
</script>

<!-- The WordPress-style toolbar for signed-in users; theme styles never reach it. -->
<div
  class="cms-admin-bar fixed inset-x-0 top-0 z-50 flex h-8 items-stretch justify-between bg-[#1d2327] font-sans text-[13px] leading-none text-white/85 shadow-sm"
  role="navigation"
  aria-label={m.adminBar}
>
  <div class="flex min-w-0 items-stretch">
    <!-- Subscribers have no dashboard; their profile is their admin home (WordPress). -->
    <a
      href={can(user, 'content.create')
        ? resolve('/admin/(app)')
        : resolve('/admin/(app)/account')}
      class={item}
    >
      <LayoutDashboard class="size-4" />
      <span class="hidden max-w-48 truncate sm:inline">{siteTitle}</span>
    </a>
    {#if can(user, 'appearance.manage')}
      <a href={resolve('/admin/(app)/appearance/editor')} class={item}>
        <Paintbrush class="size-4" />
        <span class="hidden md:inline">{m.adminBarCustomize}</span>
      </a>
    {/if}
    {#if can(user, 'content.create')}
      <a href={resolve('/admin/(app)/content/new')} class={item}>
        <Plus class="size-4" />
        <span class="hidden sm:inline">{m.adminBarNew}</span>
      </a>
      {#if entry}
        <a
          href={resolve('/admin/(app)/content/[id]', { id: entry.id })}
          class={item}
        >
          <Pencil class="size-4" />
          <span class="hidden sm:inline">{m.adminBarEdit}</span>
        </a>
      {/if}
    {/if}
    {#if previewing}
      <span class="flex items-center gap-1.5 px-2.5 text-amber-300">
        <Eye class="size-4" />
        <span class="hidden truncate md:inline"
          >{m.themePreviewing(previewing)}</span
        >
      </span>
      <a
        href={resolve('/admin/(app)/appearance/preview/exit')}
        data-sveltekit-reload
        class="{item} underline">{m.themePreviewExit}</a
      >
    {/if}
  </div>
  <div class="group/account relative flex items-stretch">
    <button type="button" class={item} aria-haspopup="true">
      <span class="hidden sm:inline">{m.adminBarHowdy(user.name ?? '')}</span>
      <UserRound class="size-4" />
    </button>
    <div
      class="invisible absolute top-full right-0 min-w-48 bg-[#2c3338] py-1.5 opacity-0 shadow-lg transition group-focus-within/account:visible group-focus-within/account:opacity-100 group-hover/account:visible group-hover/account:opacity-100"
    >
      <a
        href={resolve('/admin/(app)/account')}
        class="flex items-center gap-2 px-3 py-2 hover:bg-white/10 hover:text-white"
      >
        <UserRound class="size-4" />{m.navAccount}</a
      >
      <!-- Signing out drops this tab's editor backups. -->
      <form
        method="POST"
        action={resolve('/admin/logout')}
        onsubmit={() => clearBackups()}
      >
        <button
          type="submit"
          class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/10 hover:text-white"
        >
          <LogOut class="size-4" />{m.signOut}
        </button>
      </form>
    </div>
  </div>
</div>
