<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import { default as CircleCheck } from '@lucide/svelte/icons/circle-check';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { authMessages } from '#lib/i18n/auth.js';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import SignInMethods from '#lib/security/SignInMethods.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const auth = $derived(authMessages(i18n.language));
  const done = $derived(!!form && 'done' in form);
  const signIn = $derived(resolve(data.loginPath as Path));
  const request = resolve('/admin/(auth)/forgot-password');
  const result = $derived(
    form && 'message' in form
      ? (form as {
          method?: string;
          values?: Record<string, string>;
          captcha?: boolean;
        })
      : null,
  );
  // After a failed attempt (an expired link, say) a new link is one step away.
  const links = $derived(
    done
      ? []
      : [
          ...(data.linkValid && data.passwordReset && result
            ? [
                {
                  href: '/admin/forgot-password' as Path,
                  label: auth.requestLink,
                },
              ]
            : []),
          { href: data.loginPath as Path, label: m.backToSignIn },
        ],
  );
</script>

<svelte:head>
  <title>{m.signInSetupTitle}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<AuthShell
  title={m.signInSetupTitle}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
  {links}
>
  {#if done}
    <Alert role="status">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>{m.signInSetupDone}</AlertTitle>
    </Alert>
    <Button href={signIn} class="w-full">{m.signIn}</Button>
  {:else if !data.linkValid}
    <Alert variant="destructive"
      ><AlertTitle>{auth.linkInvalid}</AlertTitle></Alert
    >
    <Button href={request} class="w-full">{auth.requestLink}</Button>
  {:else if data.unavailable}
    <Alert variant="destructive"
      ><AlertTitle>{m.signInSetupUnavailable}</AlertTitle></Alert
    >
  {:else if !data.methods.length}
    <Alert variant="destructive"
      ><AlertTitle>{m.signInSetupNone}</AlertTitle></Alert
    >
  {:else}
    <FormMessage {form} />
    <p class="text-sm text-muted-foreground">{m.signInSetupHelp}</p>
    {#snippet hidden()}
      <input type="hidden" name="token" value={data.token} />
    {/snippet}
    <SignInMethods
      methods={data.methods}
      action="?/setup"
      submit={m.save}
      buttonLabel={m.signInSetupWith}
      captcha={data.captcha ?? undefined}
      {result}
      {hidden}
    />
  {/if}
</AuthShell>
