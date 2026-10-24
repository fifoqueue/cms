<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import { CircleCheck } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Alert, AlertTitle } from '#lib/components/ui/alert/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { authMessages } from '#lib/i18n/auth.js';
  import AuthForm from '#lib/security/AuthForm.svelte';
  import AuthShell from '#lib/security/AuthShell.svelte';
  import PasswordInput from '#lib/security/PasswordInput.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const auth = $derived(authMessages(i18n.language));
  const done = $derived(!!form && 'done' in form);
  const signIn = $derived(resolve(data.loginPath as Path));
  const request = resolve('/admin/(auth)/forgot-password');
  // After a failed attempt (an expired link, say) a new link is one step away.
  const links = $derived(
    done
      ? []
      : [
          ...(data.linkValid && form && 'message' in form
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
  <title>{m.passwordTitle}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<AuthShell
  title={m.passwordTitle}
  siteTitle={data.siteTitle}
  privacyPolicy={data.privacyPolicy}
  {links}
>
  {#if done}
    <Alert role="status">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>{m.passwordSaved}</AlertTitle>
    </Alert>
    <Button href={signIn} class="w-full">{m.signIn}</Button>
  {:else if !data.linkValid}
    <Alert variant="destructive"
      ><AlertTitle>{auth.linkInvalid}</AlertTitle></Alert
    >
    <Button href={request} class="w-full">{auth.requestLink}</Button>
  {:else}
    <FormMessage {form} />
    <AuthForm submit={m.save} enhanced>
      <input type="hidden" name="token" value={data.token} />
      <div class="grid gap-2">
        <Label for="password">{m.newPassword}</Label>
        <PasswordInput
          id="password"
          name="password"
          autocomplete="new-password"
          minlength={data.minLength}
          maxlength={data.maxLength}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" class="text-xs text-muted-foreground">
          {auth.passwordHint(data.minLength)}
        </p>
      </div>
    </AuthForm>
  {/if}
</AuthShell>
