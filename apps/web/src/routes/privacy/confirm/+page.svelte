<script lang="ts">
  import PrivacyPolicyLink from '#lib/theme/PrivacyPolicyLink.svelte';
  import Captcha from '#lib/security/Captcha.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { provideI18n, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  provideI18n(() => data.language);
  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.privacyConfirmTitle}</title></svelte:head>
<section class="mx-auto max-w-xl space-y-5 px-4 py-16">
  <h1 class="text-2xl font-semibold">{m.privacyConfirmTitle}</h1>
  <FormMessage {form} />
  {#if !form || !('notice' in form)}<p>
      {data.requestId ? m.privacyConfirmHelp : m.privacyOpenLink}
    </p>
    <form
      method="POST"
      action="?/confirm&request={data.requestId}"
      class="space-y-4"
    >
      <input type="hidden" name="requestId" value={data.requestId} />
      {#if data.captcha.provider !== 'none' && (data.captcha.always.includes('privacy') || (form && 'captcha' in form && form.captcha))}<Captcha
          captcha={data.captcha}
        />{/if}<Button type="submit" disabled={!data.requestId}
        >{m.privacyConfirm}</Button
      >
    </form>{/if}
  <PrivacyPolicyLink policy={data.privacyPolicy} />
</section>
