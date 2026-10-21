<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    ExternalLink,
    FileText,
    LogOut,
    Plug,
    Settings,
    UserRound,
  } from '@lucide/svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const links = [
    { route: '/admin/(app)/content', label: 'Content', icon: FileText },
    { route: '/admin/(app)/plugins', label: 'Plugins', icon: Plug },
    { route: '/admin/(app)/settings', label: 'Settings', icon: Settings },
    { route: '/admin/(app)/account', label: 'Account', icon: UserRound },
  ] as const;
</script>

<div class="flex min-h-screen flex-col bg-muted/40 md:flex-row">
  <aside class="border-b bg-background md:w-56 md:border-r md:border-b-0">
    <div class="flex items-center justify-between px-4 py-4 md:block">
      <a href={resolve('/admin/(app)')} class="font-semibold">CMS</a>
      <p class="hidden text-sm text-muted-foreground md:mt-1 md:block">
        {data.user.name}
      </p>
    </div>
    <nav class="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
      {#each links as link (link.route)}
        {@const Icon = link.icon}
        <a
          href={resolve(link.route)}
          aria-current={page.route.id?.startsWith(link.route)
            ? 'page'
            : undefined}
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium"
        >
          <Icon class="size-4" />
          {link.label}
        </a>
      {/each}
      <a
        href={resolve('/(site)')}
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
      >
        <ExternalLink class="size-4" /> View site
      </a>
      <form method="POST" action="/admin/logout">
        <Button
          type="submit"
          variant="ghost"
          class="w-full justify-start gap-2 px-3 font-normal"
        >
          <LogOut class="size-4" /> Sign out
        </Button>
      </form>
    </nav>
  </aside>
  <main class="flex-1 p-4 md:p-8">
    <div class="mx-auto max-w-5xl space-y-6">
      {@render children()}
    </div>
  </main>
</div>
