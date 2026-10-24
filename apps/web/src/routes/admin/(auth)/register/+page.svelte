<script lang="ts">
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { authMessages } from '#lib/i18n/auth.js';
  import MailRequest from '#lib/security/MailRequest.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const auth = $derived(authMessages(i18n.language));
</script>

<svelte:head><title>{m.registerTitle}</title></svelte:head>

<MailRequest
  title={m.registerTitle}
  description={m.registerHelp}
  sentTitle={auth.registerSent}
  closed={data.membership.enabled ? undefined : m.registrationClosed}
  submit={m.registerTitle}
  maxlength={191}
  captcha={data.captcha}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
  loginPath={data.loginPath}
  {form}
>
  <div class="grid gap-2">
    <Label for="name">{m.name}</Label>
    <Input
      id="name"
      name="name"
      autocomplete="name"
      required
      maxlength={191}
      value={form && 'name' in form ? form.name : ''}
    />
  </div>
</MailRequest>
