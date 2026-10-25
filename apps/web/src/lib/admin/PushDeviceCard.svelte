<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { notifyFailure, notifySuccess } from '#lib/feedback.js';
  import { useI18n } from '#lib/i18n/index.js';
  import {
    currentSubscription,
    disablePush,
    pushSupported,
  } from '#lib/push-client.js';
  import { ADMIN_PUSH_PATH } from '#lib/push.js';

  /** Turns this browser's comment notifications off; shown only where browsers can push. */
  const i18n = useI18n();
  const m = $derived(i18n.m);
  let subscribed = $state<boolean | null>(null);
  let busy = $state(false);

  onMount(() => {
    if (!pushSupported()) return;
    currentSubscription().then(
      (current) => (subscribed = !!current),
      () => (subscribed = false),
    );
  });

  // An endpoint the server never had (or already dropped) is off there too.
  const forget = (endpoint: string) =>
    fetch(ADMIN_PUSH_PATH, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).then(
      (response) => response.ok || response.status === 404,
      () => false,
    );

  const turnOff = async () => {
    busy = true;
    const done = await disablePush(forget).catch(() => false);
    busy = false;
    if (!done) {
      notifyFailure(m.pushDisableFailed);
      return;
    }
    subscribed = false;
    notifySuccess(m.pushDisabled);
  };
</script>

{#if subscribed !== null}
  <Card>
    <CardHeader><CardTitle>{m.pushTitle}</CardTitle></CardHeader>
    <CardContent class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">
        {subscribed ? m.pushOn : m.pushOff}
      </p>
      {#if subscribed}
        <Button variant="outline" disabled={busy} onclick={turnOff}
          >{m.pushDisable}</Button
        >
      {/if}
    </CardContent>
  </Card>
{/if}
