<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import Captcha from '#lib/security/Captcha.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const title = $derived(
    data.action === 'export' ? m.privacyExport : m.privacyErase,
  );
</script>

<svelte:head><title>{title}</title></svelte:head>
<h1 class="text-2xl font-semibold">{title}</h1>
<p class="max-w-2xl text-sm text-muted-foreground">{m.privacyRequestHelp}</p>
{#if data.action === 'erase'}<p class="max-w-2xl text-sm text-muted-foreground">
    {m.privacyRetained}
  </p>{/if}
<FormMessage {form} />
<form
  method="POST"
  action="?/create"
  class="flex max-w-xl flex-wrap items-end gap-3"
>
  <label class="grid flex-1 gap-1 text-sm"
    >{m.email}<Input
      type="email"
      name="email"
      maxlength={191}
      required
    /></label
  >
  {#if data.captcha.provider !== 'none' && (data.captcha.always.includes('privacy') || (form && 'captcha' in form && form.captcha))}<Captcha
      captcha={data.captcha}
    />{/if}
  <Button type="submit">{m.privacySendRequest}</Button>
</form>
<ul class="space-y-3">
  {#each data.requests.items as request (request.id)}<li
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
    >
      <div>
        <p class="font-medium">{request.email}</p>
        <p class="text-sm text-muted-foreground">
          {m.privacyStatus(request.status)} · {new Date(
            request.createdAt,
          ).toLocaleDateString(i18n.language)}
        </p>
      </div>
      {#if data.action === 'export' && request.status !== 'pending'}<form
          method="POST"
          action={resolve('/admin/(app)/tools/privacy/[action]/[id]/download', {
            action: data.action,
            id: request.id,
          })}
        >
          <Button type="submit" variant="outline">{m.privacyDownload}</Button>
        </form>{/if}
      {#if data.action === 'erase' && request.status === 'confirmed'}<form
          method="POST"
          action="?/erase"
          use:enhance={({ cancel }) => {
            if (!confirm(m.privacyEraseConfirm)) cancel();
          }}
        >
          <input type="hidden" name="id" value={request.id} /><Button
            type="submit"
            variant="destructive">{m.privacyErase}</Button
          >
        </form>{/if}
    </li>{:else}<li class="py-8 text-muted-foreground">
      {m.privacyNoRequests}
    </li>{/each}
</ul>
<!-- eslint-disable svelte/no-navigation-without-resolve -- base paths are resolved before adding page queries -->
<nav class="flex gap-4 text-sm" aria-label={m.pagination}>
  {#if data.requests.page > 1}<a
      href={`${resolve('/admin/(app)/tools/privacy/[action]', { action: data.action })}?page=${data.requests.page - 1}`}
      >{m.previous}</a
    >{/if}
  {#if data.requests.page * data.requests.pageSize < data.requests.total}<a
      href={`${resolve('/admin/(app)/tools/privacy/[action]', { action: data.action })}?page=${data.requests.page + 1}`}
      >{m.next}</a
    >{/if}
</nav>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
