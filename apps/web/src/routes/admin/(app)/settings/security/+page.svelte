<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import { CAPTCHA_PROVIDERS, PROTECTED_ACTIONS, RATE_RULES } from '@cms/sdk';
  import type { ProtectedAction, RateRuleName } from '@cms/sdk';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import SecretField from '#lib/admin/settings/SecretField.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { Messages } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const settings = $derived(data.security);

  const providerNames: Record<(typeof CAPTCHA_PROVIDERS)[number], string> = {
    none: '',
    turnstile: 'Cloudflare Turnstile',
    hcaptcha: 'hCaptcha',
    recaptcha: 'Google reCAPTCHA',
  };
  const actionLabel = (m: Messages, action: ProtectedAction) =>
    ({
      login: m.actionLogin,
      passwordReset: m.actionPasswordReset,
      comment: m.actionComment,
      contentUnlock: m.actionContentUnlock,
      privacy: m.privacyConfirmTitle,
    })[action];
  const ruleLabel = (m: Messages, rule: RateRuleName) =>
    ({
      loginClient: m.ruleLoginClient,
      loginAccount: m.ruleLoginAccount,
      passwordResetClient: m.rulePasswordResetClient,
      passwordResetAccount: m.rulePasswordResetAccount,
      commentClient: m.ruleCommentClient,
      contentUnlockClient: m.ruleContentUnlockClient,
      privacyClient: m.privacyRateRule,
    })[rule];
</script>

<svelte:head><title>{m.settingsSecurity}</title></svelte:head>

<FormMessage {form} />

<SettingsForm class="space-y-6">
  <Card>
    <CardHeader><CardTitle>{m.captchaTitle}</CardTitle></CardHeader>
    <CardContent class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="provider">{m.captchaProvider}</Label>
        <NativeSelect
          class="w-full"
          id="provider"
          name="provider"
          value={settings.captcha.provider}
        >
          {#each CAPTCHA_PROVIDERS as provider (provider)}
            <NativeSelectOption value={provider}
              >{provider === 'none'
                ? m.captchaNone
                : providerNames[provider]}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-2">
        <Label for="siteKey">{m.captchaSiteKey}</Label>
        <Input
          id="siteKey"
          name="siteKey"
          maxlength={200}
          value={settings.captcha.siteKey}
        />
      </div>
      <SecretField
        name="secretKey"
        label={m.captchaSecretKey}
        configured={settings.captcha.secretConfigured}
        removeName="removeSecret"
        helpId="secret-help"
      />
      <div class="grid gap-2">
        <Label for="minimumScore">{m.captchaMinimumScore}</Label>
        <Input
          id="minimumScore"
          name="minimumScore"
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={settings.captcha.minimumScore}
        />
      </div>
      <fieldset class="grid gap-3 sm:col-span-2">
        <legend class="mb-2 text-sm font-medium">{m.captchaWhen}</legend>
        {#each PROTECTED_ACTIONS as action (action)}
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Label for={`mode-${action}`}>{actionLabel(m, action)}</Label>
            <NativeSelect
              id={`mode-${action}`}
              name={`mode.${action}`}
              value={settings.captcha.modes[action]}
            >
              <NativeSelectOption value="always"
                >{m.captchaAlways}</NativeSelectOption
              >
              <NativeSelectOption value="limited"
                >{m.captchaLimited}</NativeSelectOption
              >
              <NativeSelectOption value="never"
                >{m.captchaNever}</NativeSelectOption
              >
            </NativeSelect>
          </div>
        {/each}
      </fieldset>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.limitsTitle}</CardTitle>
      <CardDescription>{m.limitsHelp}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      {#each RATE_RULES as name (name)}
        {@const rule = settings.rules[name]}
        <fieldset class="grid gap-3 sm:grid-cols-5 sm:items-end">
          <legend class="mb-2 text-sm font-medium sm:col-span-5">
            {ruleLabel(m, name)}
          </legend>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`${name}.enabled`}
              checked={rule.enabled}
            />
            {m.ruleEnabled}
          </label>
          <div class="grid gap-1">
            <Label for={`${name}-max`} class="text-xs">{m.ruleMax}</Label>
            <Input
              id={`${name}-max`}
              name={`${name}.max`}
              type="number"
              min={1}
              max={100000}
              value={rule.max}
            />
          </div>
          <div class="grid gap-1">
            <Label for={`${name}-window`} class="text-xs">{m.ruleWindow}</Label>
            <Input
              id={`${name}-window`}
              name={`${name}.windowSeconds`}
              type="number"
              min={1}
              max={86400}
              value={rule.windowSeconds}
            />
          </div>
          <div class="grid gap-1">
            <Label for={`${name}-block`} class="text-xs">{m.ruleBlock}</Label>
            <Input
              id={`${name}-block`}
              name={`${name}.blockSeconds`}
              type="number"
              min={0}
              max={86400}
              value={rule.blockSeconds}
            />
          </div>
          <div class="grid gap-1">
            <Label for={`${name}-enforcement`} class="text-xs"
              >{m.ruleEnforcement}</Label
            >
            <NativeSelect
              class="w-full"
              id={`${name}-enforcement`}
              name={`${name}.enforcement`}
              value={rule.enforcement}
            >
              <NativeSelectOption value="block"
                >{m.enforcementBlock}</NativeSelectOption
              >
              <NativeSelectOption value="captcha"
                >{m.enforcementCaptcha}</NativeSelectOption
              >
            </NativeSelect>
          </div>
        </fieldset>
      {/each}
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.mediaAdmissionTitle}</CardTitle>
      <CardDescription>{m.mediaAdmissionHelp}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4 sm:grid-cols-2">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          name="media.allowSvg"
          checked={settings.media.allowSvg === true}
        />
        {m.mediaAllowSvg}
      </label>
      <div class="grid gap-2">
        <Label for="media-uploads">{m.mediaUploadsPerHour}</Label>
        <Input
          id="media-uploads"
          name="media.uploadsPerHour"
          type="number"
          min={0}
          max={100000}
          value={settings.media.uploadsPerHour}
        />
      </div>
      <div class="grid gap-2">
        <Label for="media-space">{m.mediaFreeSpaceMb}</Label>
        <Input
          id="media-space"
          name="media.freeSpaceMb"
          type="number"
          min={0}
          max={1048576}
          value={settings.media.freeSpaceMb}
        />
      </div>
    </CardContent>
  </Card>

  <Button type="submit">{m.save}</Button>
</SettingsForm>
