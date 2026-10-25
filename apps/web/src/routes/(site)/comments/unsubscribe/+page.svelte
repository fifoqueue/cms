<script lang="ts">
  import { errorMessage } from '#lib/admin/form-errors.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const channel = $derived(form && 'channel' in form ? form.channel : null);
  const failure = $derived(
    form && 'message' in form ? (form as Record<string, unknown>) : null,
  );
</script>

<AuthShell
  title={m.commentUnsubscribeTitle}
  siteTitle={data.site.title}
  privacyPolicy={data.privacy.policy}
>
  {#if channel}
    <p class="text-sm" role="status">
      {channel === 'email'
        ? m.commentUnsubscribedEmail
        : m.commentUnsubscribedPush}
    </p>
  {:else if failure || !data.token}
    <p class="text-sm text-destructive" role="alert">
      {failure
        ? errorMessage(m, i18n.language, failure)
        : m.apiError('CommentUnsubscribeInvalid')}
    </p>
  {:else}
    <p class="text-sm text-muted-foreground">{m.commentUnsubscribeConfirm}</p>
    <form method="POST">
      <input type="hidden" name="token" value={data.token} />
      <Button type="submit" class="w-full">{m.commentUnsubscribeButton}</Button>
    </form>
  {/if}
</AuthShell>
