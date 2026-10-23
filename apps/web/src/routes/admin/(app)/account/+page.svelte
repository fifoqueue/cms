<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { ADMIN_LOCALES } from '@cms/sdk/locales';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const languageNames: Record<(typeof ADMIN_LOCALES)[number], string> = {
    en: 'English',
    ko: '한국어',
  };

  const identity = $derived(data.status.identity);

  const confirmUnlink: SubmitFunction = ({ cancel }) => {
    if (!confirm('Stop signing in with this single sign-on account?')) cancel();
  };
</script>

<svelte:head><title>{m.accountTitle}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.accountTitle}</h1>
<FormMessage {form} />

<Card>
  <CardHeader>
    <CardTitle>{m.profileTitle}</CardTitle>
  </CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/profile"
      use:enhance={() =>
        ({ update }) =>
          update({ reset: false })}
      class="grid gap-4 sm:grid-cols-2"
    >
      <div class="grid gap-2">
        <Label for="name">{m.name}</Label>
        <Input
          id="name"
          name="name"
          required
          maxlength={191}
          autocomplete="name"
          value={data.user.name}
        />
      </div>
      <div class="grid gap-2">
        <Label for="email">{m.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          maxlength={191}
          autocomplete="email"
          value={data.user.email}
        />
      </div>
      <div class="grid gap-2">
        <Label for="slug">{m.slug}</Label>
        <Input
          id="slug"
          name="slug"
          required
          maxlength={191}
          value={data.user.slug}
          aria-describedby="slug-help"
        />
        <p id="slug-help" class="text-xs text-muted-foreground">
          {m.profileSlugHelp}
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="locale">{m.language}</Label>
        <NativeSelect
          class="w-full"
          id="locale"
          name="locale"
          value={data.user.locale}
        >
          <NativeSelectOption value="">{m.siteDefault}</NativeSelectOption>
          {#each ADMIN_LOCALES as language (language)}
            <NativeSelectOption value={language}
              >{languageNames[language]}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-2 sm:col-span-2">
        <Label for="bio">{m.bio}</Label>
        <Textarea id="bio" name="bio" maxlength={2000} value={data.user.bio} />
      </div>
      <div class="sm:col-span-2">
        <Button type="submit">{m.save}</Button>
      </div>
    </form>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.passwordChangeTitle}</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/password"
      use:enhance
      class="grid gap-4 sm:grid-cols-2"
    >
      <!-- Lets password managers pair the new password with this account. -->
      <input
        type="text"
        name="username"
        autocomplete="username"
        value={data.user.email}
        hidden
        readonly
      />
      <div class="grid gap-2">
        <Label for="current">{m.currentPassword}</Label>
        <Input
          id="current"
          name="current"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <div class="grid gap-2">
        <Label for="new-password">{m.newPassword}</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autocomplete="new-password"
          minlength={8}
          maxlength={200}
          required
        />
      </div>
      <div class="sm:col-span-2">
        <Button type="submit">{m.save}</Button>
      </div>
    </form>
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle>{m.tokensTitle}</CardTitle>
    <CardDescription>{m.tokensHelp}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if form && 'token' in form && form.token}
      <div class="space-y-2 rounded-md border bg-muted p-3">
        <p class="text-sm font-medium">{m.tokenCreated}</p>
        <code class="block break-all text-sm select-all">{form.token}</code>
      </div>
    {/if}
    {#if data.tokens.length}
      <ul class="divide-y rounded-md border">
        {#each data.tokens as token (token.id)}
          <li class="flex flex-wrap items-center justify-between gap-3 p-3">
            <div class="text-sm">
              <p class="font-medium">{token.name}</p>
              <p class="text-muted-foreground">
                {m.tokenLastUsed}:
                {token.lastUsedAt
                  ? new Date(token.lastUsedAt).toLocaleString(i18n.language)
                  : m.none}
                · {m.tokenExpires}:
                {token.expiresAt
                  ? new Date(token.expiresAt).toLocaleDateString(i18n.language)
                  : m.tokenNever}
              </p>
            </div>
            <form method="POST" action="?/tokenRevoke" use:enhance>
              <input type="hidden" name="id" value={token.id} />
              <Button type="submit" variant="outline" size="sm"
                >{m.tokenRevoke}</Button
              >
            </form>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">{m.tokensEmpty}</p>
    {/if}
    <form
      method="POST"
      action="?/tokenCreate"
      use:enhance
      class="flex flex-wrap items-end gap-4"
    >
      <div class="grid gap-2">
        <Label for="token-name">{m.tokenName}</Label>
        <Input id="token-name" name="name" required maxlength={100} />
      </div>
      <div class="grid gap-2">
        <Label for="token-days">{m.tokenExpires}</Label>
        <Input
          id="token-days"
          name="expiresInDays"
          type="number"
          min={1}
          max={3650}
          placeholder={m.tokenNever}
          class="w-32"
        />
      </div>
      <Button type="submit">{m.tokenCreate}</Button>
    </form>
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      Single sign-on
      {#if identity}
        <Badge>Linked</Badge>
      {:else}
        <Badge variant="secondary">Not linked</Badge>
      {/if}
    </CardTitle>
    <CardDescription>
      {#if data.sso.enabled}
        Link an account at {data.sso.name} to sign in to this account with it. Your
        password keeps working.
      {:else}
        Single sign-on is not available on this site.
      {/if}
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if identity}
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Provider</dt>
        <dd class="break-all">{identity.issuer}</dd>
        <dt class="text-muted-foreground">Account ID</dt>
        <dd class="break-all">{identity.subject}</dd>
        <dt class="text-muted-foreground">Linked</dt>
        <dd>{new Date(identity.linkedAt).toLocaleString()}</dd>
      </dl>
    {/if}

    {#if data.status.assigned}
      <p class="text-sm text-muted-foreground">
        The site operator has also assigned a single sign-on account to you.
      </p>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#if data.sso.enabled}
        <!-- Not enhanced: the browser has to follow the redirect to the provider. -->
        <form method="POST" action="?/link">
          <Button type="submit" variant="outline">
            {identity ? 'Link a different account' : `Link ${data.sso.name}`}
          </Button>
        </form>
      {/if}

      {#if identity}
        <form method="POST" action="?/unlink" use:enhance={confirmUnlink}>
          <Button type="submit" variant="destructive">Unlink</Button>
        </form>
      {/if}
    </div>
  </CardContent>
</Card>
