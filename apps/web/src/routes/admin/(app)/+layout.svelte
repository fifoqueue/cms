<script lang="ts">
  import { resolve } from '$app/paths';
  import { afterNavigate } from '$app/navigation';
  import { ExternalLink, LogOut, Menu, X } from '@lucide/svelte';
  import AdminMenu from '#lib/admin/AdminMenu.svelte';
  import ColorModeToggle from '#lib/admin/ColorModeToggle.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { provideI18n } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const i18n = provideI18n(() => data.language);

  /** The small-screen menu panel. */
  let expanded = $state(false);

  afterNavigate(() => {
    expanded = false;
  });
</script>

<div
  class="flex min-h-screen flex-col bg-muted/40 md:flex-row"
  lang={i18n.language}
>
  <aside
    class="border-b bg-background md:w-56 md:shrink-0 md:border-r md:border-b-0"
  >
    <div class="flex items-center justify-between gap-2 px-4 py-3 md:block">
      <div>
        <a href={resolve('/admin/(app)')} class="font-semibold">CMS</a>
        <a
          href={resolve('/admin/(app)/account')}
          class="hidden truncate text-sm text-muted-foreground hover:text-foreground md:mt-1 md:block"
          >{data.user.name}</a
        >
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="md:hidden"
        aria-expanded={expanded}
        aria-controls="admin-menu"
        onclick={() => (expanded = !expanded)}
      >
        {#if expanded}<X />{:else}<Menu />{/if}
        <span class="sr-only">{i18n.m.navMenu}</span>
      </Button>
    </div>
    <div
      id="admin-menu"
      class={['flex-col gap-4 px-2 pb-3 md:flex', expanded ? 'flex' : 'hidden']}
    >
      <nav aria-label={i18n.m.navMenu}>
        <AdminMenu
          user={data.user}
          pluginPages={data.pluginPages}
          types={data.types}
          taxonomies={data.taxonomies}
          counts={data.counts}
        />
      </nav>
      <div class="space-y-1 border-t pt-3">
        <a
          href={resolve('/(site)')}
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
        >
          <ExternalLink class="size-4" />
          {i18n.m.viewSite}
        </a>
        <form method="POST" action="/admin/logout">
          <Button
            type="submit"
            variant="ghost"
            class="w-full justify-start gap-2 px-3 font-normal text-foreground/80"
          >
            <LogOut class="size-4" />
            {i18n.m.signOut}
          </Button>
        </form>
        <div class="px-3 pt-1">
          <ColorModeToggle mode={data.colorMode} />
        </div>
      </div>
    </div>
  </aside>
  <main class="min-w-0 flex-1 p-4 md:p-8">
    <div class="mx-auto max-w-5xl space-y-6">
      {@render children()}
    </div>
  </main>
</div>
