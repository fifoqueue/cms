<script lang="ts">
  import { useI18n } from '#lib/i18n/index.js';
  import MailRequest from '#lib/security/MailRequest.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.forgotTitle}</title></svelte:head>

<MailRequest
  title={m.forgotTitle}
  description={m.forgotHelp}
  sentTitle={m.forgotSent}
  closed={data.passwordReset ? undefined : m.forgotClosed}
  submit={m.forgotSend}
  captcha={data.captcha}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
  loginPath={data.loginPath}
  {form}
/>
