<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import CopyButton from '#lib/admin/CopyButton.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import PluginProfileFieldsCard from '#lib/admin/PluginProfileFieldsCard.svelte';
  import PushDeviceCard from '#lib/admin/PushDeviceCard.svelte';
  import {
    profileFieldsRefusal,
    splitProfileIssues,
  } from '#lib/admin/plugin-profile-fields.js';
  import { errorMessage } from '#lib/admin/form-errors.js';
  import { RECENT_SIGN_IN_MESSAGES } from '#lib/admin/sso-messages.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
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
  import ProfileFields from '#lib/admin/ProfileFields.svelte';
  import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import SignInStep from '#lib/security/SignInStep.svelte';
  import { credentialLabel, factorLabel } from '#lib/sign-in-labels.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const languageNames: Record<(typeof ADMIN_LOCALES)[number], string> = {
    en: 'English',
    ko: '한국어',
  };

  /** Each enabled provider with the user's linked account there and any operator assignment. */
  const providers = $derived(
    data.sso.providers.map((provider) => ({
      ...provider,
      identity:
        data.identities.find((identity) =>
          identity.providers.includes(provider.id),
        ) ?? null,
      assigned: data.assigned.includes(provider.id),
    })),
  );
  /** Linked accounts of providers that are no longer enabled or configured. */
  const others = $derived(
    data.identities.filter(
      (identity) =>
        !data.sso.providers.some((provider) =>
          identity.providers.includes(provider.id),
        ),
    ),
  );
  const codes = $derived(
    form && 'codes' in form && Array.isArray(form.codes)
      ? (form.codes as string[])
      : null,
  );
  const codesFile = $derived(
    codes &&
      `data:text/plain;charset=utf-8,${encodeURIComponent(`${codes.join('\n')}\n`)}`,
  );

  const confirmUnlink: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.ssoUnlinkConfirm)) cancel();
  };
  const confirmGenerate: SubmitFunction = ({ cancel }) => {
    if (data.recovery?.createdAt && !confirm(m.recoveryCodesReplaceConfirm))
      cancel();
  };
  const confirmRemoveCodes: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.recoveryCodesRemoveConfirm)) cancel();
  };
  const confirmRemoveFactor =
    (label: string): SubmitFunction =>
    ({ cancel }) => {
      if (!confirm(m.factorRemoveConfirm(label))) cancel();
    };
  /** The core recovery-code factor; its codes have their own section. */
  const RECOVERY_FACTOR = 'recovery-code';
  /** Must match `ENROLL_ANCHOR`, where enrollment steps are shown. */
  const ENROLL_SECTION = 'two-step';
  const anyEnrolled = $derived(
    data.factors.factors.some((factor) => factor.enrolled),
  );
  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
  /** A refused save of the plugin profile fields; its field issues show next to the fields. */
  const profileRefusal = $derived(profileFieldsRefusal(form));
  const profileIssues = $derived(
    splitProfileIssues(profileRefusal?.issues ?? [], data.profileFields),
  );
  /** A credential change the API wants a fresh interactive sign-in for. */
  const reauth = $derived(
    !!form &&
      'message' in form &&
      typeof form.message === 'string' &&
      RECENT_SIGN_IN_MESSAGES.includes(form.message),
  );
</script>

{#snippet linked(identity: (typeof data.identities)[number])}
  <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
    <dt class="text-muted-foreground">{m.ssoProvider}</dt>
    <dd class="break-all">{identity.issuer}</dd>
    <dt class="text-muted-foreground">{m.ssoAccountId}</dt>
    <dd class="break-all">{identity.subject}</dd>
    <dt class="text-muted-foreground">{m.ssoLinkedOn}</dt>
    <dd>{date(identity.linkedAt)}</dd>
  </dl>
  <form method="POST" action="?/unlink" use:enhance={confirmUnlink}>
    <input type="hidden" name="id" value={identity.id} />
    <Button type="submit" variant="destructive" size="sm">{m.ssoUnlink}</Button>
  </form>
{/snippet}

<svelte:head><title>{m.accountTitle}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.accountTitle}</h1>
{#if reauth}
  <!-- A fresh sign-in resolves it: sign out here and come back to this page. -->
  <Alert variant="destructive" role="alert">
    <AlertDescription class="flex flex-wrap items-center gap-3">
      <span>{errorMessage(m, i18n.language, form ?? {})}</span>
      <form method="POST" action="/admin/logout">
        <input type="hidden" name="redirect_to" value="/admin/account" />
        <Button type="submit" size="sm" variant="outline"
          >{m.signInAgain}</Button
        >
      </form>
    </AlertDescription>
  </Alert>
{/if}
<FormMessage
  form={reauth
    ? null
    : profileRefusal
      ? { ...profileRefusal, issues: profileIssues.apart }
      : form}
/>

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
      <ProfileFields profile={data.user} autocomplete>
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
      </ProfileFields>
      <div class="sm:col-span-2">
        <Button type="submit">{m.save}</Button>
      </div>
    </form>
  </CardContent>
</Card>

<PluginProfileFieldsCard
  meta={data.profileFields}
  typed={profileRefusal?.typed}
  issues={profileIssues.placed}
/>

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
    <CardTitle>{m.sessionsTitle}</CardTitle>
    <CardDescription>{m.sessionsHelp}</CardDescription>
  </CardHeader>
  <CardContent>
    <ul class="divide-y text-sm">
      {#each data.sessions as session (session.id)}
        <li class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            {m.sessionStarted(
              new Date(session.createdAt).toLocaleString(i18n.language),
            )}
            <span class="block text-xs text-muted-foreground"
              >{m.sessionExpires(
                new Date(session.expiresAt).toLocaleString(i18n.language),
              )}</span
            >
          </span>
          {#if session.current}
            <Badge variant="secondary">{m.sessionCurrent}</Badge>
          {:else}
            <form method="POST" action="?/sessionRevoke" use:enhance>
              <input type="hidden" name="id" value={session.id} />
              <Button type="submit" variant="outline" size="sm"
                >{m.sessionRevoke}</Button
              >
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  </CardContent>
</Card>

<PushDeviceCard />

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

<!-- Hidden while no provider is enabled, unless a link remains to show. -->
{#if providers.length || others.length}
  <Card>
    <CardHeader>
      <CardTitle>{m.settingsSso}</CardTitle>
      <CardDescription>{m.ssoLinkHelp}</CardDescription>
    </CardHeader>
    <CardContent>
      <ul class="divide-y">
        {#each providers as provider (provider.id)}
          <li class="grid gap-3 py-4 first:pt-0 last:pb-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{provider.name}</span>
              {#if provider.identity}
                <Badge>{m.ssoLinked}</Badge>
              {:else}
                <Badge variant="secondary">{m.ssoNotLinked}</Badge>
              {/if}
              {#if provider.assigned}
                <Badge variant="outline">{m.ssoAssignedBadge}</Badge>
              {/if}
            </div>
            {#if provider.assigned}
              <p class="text-sm text-muted-foreground">{m.ssoAssigned}</p>
            {/if}
            {#if provider.identity}
              {@render linked(provider.identity)}
            {:else}
              <!-- Not enhanced: the browser has to follow the redirect to the provider. -->
              <form method="POST" action="?/link">
                <input type="hidden" name="provider" value={provider.id} />
                <Button type="submit" variant="outline" size="sm"
                  >{m.ssoLink}</Button
                >
              </form>
            {/if}
          </li>
        {/each}
        {#each others as identity (identity.id)}
          <li class="grid gap-3 py-4 first:pt-0 last:pb-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{m.ssoOtherAccount}</span>
              <Badge variant="secondary">{m.ssoProviderUnavailable}</Badge>
            </div>
            {@render linked(identity)}
          </li>
        {/each}
      </ul>
    </CardContent>
  </Card>
{/if}

<Card id={ENROLL_SECTION}>
  <CardHeader>
    <CardTitle>{m.factorsTitle}</CardTitle>
    <CardDescription>{m.factorsHelp}</CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if data.factors.required}
      <Alert variant={anyEnrolled ? 'default' : 'destructive'}>
        <AlertDescription
          >{anyEnrolled
            ? m.factorsRequired
            : m.factorsRequiredMissing}</AlertDescription
        >
      </Alert>
    {/if}
    {#if data.enrollment}
      <div class="grid gap-4 rounded-md border p-4">
        <p class="text-sm font-medium">{m.factorSetupTitle}</p>
        <SignInStep
          step={data.enrollment}
          cancelLabel={m.factorSetupCancel}
          actions={{
            continue: '?/factorContinue',
            factor: '?/factorChoose',
            cancel: '?/factorCancel',
          }}
          result={form && 'values' in form ? form : null}
        />
      </div>
    {/if}
    {#if data.factors.factors.length}
      <ul class="divide-y rounded-md border">
        {#each data.factors.factors as factor (factor.id)}
          <li class="grid gap-3 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{factorLabel(m, factor)}</span>
              {#if factor.enrolled}
                <Badge>{m.factorOn}</Badge>
              {:else}
                <Badge variant="secondary">{m.factorOff}</Badge>
              {/if}
            </div>
            {#if factor.id === RECOVERY_FACTOR && data.recovery}
              <!-- Recovery codes are managed in their own section below. -->
              <a
                href="#recovery-codes"
                class="text-sm text-primary underline-offset-4 hover:underline"
                >{m.factorRecoveryCodesLink}</a
              >
            {:else}
              {#if factor.credentials.length}
                <ul class="grid gap-2 text-sm">
                  {#each factor.credentials as credential (credential.id)}
                    <li
                      class="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {credentialLabel(m, factor, credential)}
                        {#if credential.createdAt}
                          <span class="block text-xs text-muted-foreground"
                            >{m.factorAddedOn(date(credential.createdAt))}</span
                          >
                        {/if}
                      </span>
                      <form
                        method="POST"
                        action="?/factorRemove"
                        use:enhance={confirmRemoveFactor(
                          credentialLabel(m, factor, credential),
                        )}
                      >
                        <input type="hidden" name="factor" value={factor.id} />
                        <input
                          type="hidden"
                          name="credential"
                          value={credential.id}
                        />
                        <Button type="submit" variant="outline" size="sm"
                          >{m.factorRemove}</Button
                        >
                      </form>
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if factor.enrollable}
                <!-- Not enhanced: the next step may be a page of its own (a provider). -->
                <form method="POST" action="?/factorEnroll">
                  <input type="hidden" name="factor" value={factor.id} />
                  <Button type="submit" variant="outline" size="sm"
                    >{factor.credentials.length
                      ? m.factorAddAnother
                      : factor.enrolled
                        ? m.factorSetUpAgain
                        : m.factorSetUp}</Button
                  >
                </form>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">{m.factorsNone}</p>
    {/if}
  </CardContent>
</Card>

{#if data.recovery}
  <Card id="recovery-codes">
    <CardHeader>
      <CardTitle>{m.recoveryCodesTitle}</CardTitle>
      <CardDescription>{m.recoveryCodesHelp}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if codes && codesFile}
        <div class="space-y-3 rounded-md border bg-muted p-3">
          <p class="text-sm font-medium">{m.recoveryCodesShownOnce}</p>
          <ul
            class="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm select-all sm:grid-cols-3"
          >
            {#each codes as code, index (index)}
              <li>{code}</li>
            {/each}
          </ul>
          <div class="flex flex-wrap items-center gap-2">
            <CopyButton text={codes.join('\n')} label={m.recoveryCodesCopy} />
            <!-- eslint-disable svelte/no-navigation-without-resolve -- a generated file, not a page -->
            <a
              href={codesFile}
              download="recovery-codes.txt"
              class={buttonVariants({ variant: 'outline', size: 'sm' })}
              >{m.recoveryCodesDownload}</a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          </div>
        </div>
      {/if}
      <p class="text-sm">
        {#if data.recovery.createdAt}
          {m.recoveryCodesStatus(
            data.recovery.remaining,
            date(data.recovery.createdAt),
          )}
        {:else}
          {m.recoveryCodesNone}
        {/if}
      </p>
      <div class="flex flex-wrap gap-2">
        <form
          method="POST"
          action="?/recoveryGenerate"
          use:enhance={confirmGenerate}
        >
          <Button type="submit"
            >{data.recovery.createdAt
              ? m.recoveryCodesRegenerate
              : m.recoveryCodesGenerate}</Button
          >
        </form>
        {#if data.recovery.createdAt}
          <form
            method="POST"
            action="?/recoveryRemove"
            use:enhance={confirmRemoveCodes}
          >
            <Button type="submit" variant="destructive"
              >{m.recoveryCodesRemove}</Button
            >
          </form>
        {/if}
      </div>
    </CardContent>
  </Card>
{/if}
