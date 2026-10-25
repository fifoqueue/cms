<script lang="ts">
  import type { PublicCaptcha } from '@cms/sdk';
  import type { Snippet } from 'svelte';
  import { Separator } from '#lib/components/ui/separator/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import AuthForm from '#lib/security/AuthForm.svelte';
  import Captcha from '#lib/security/Captcha.svelte';
  import SignInFields from '#lib/security/SignInFields.svelte';
  import SsoButtons from '#lib/security/SsoButtons.svelte';
  import type { MethodView } from '#lib/server/sign-in-view.js';
  import { methodLabel } from '#lib/sign-in-labels.js';

  /**
   * Every method the API describes, in its order and the same way for core and plugin methods:
   * one with fields is a form, one with options a button per option, any other one button. Each
   * posts `method` (and the chosen `option`) to `action`.
   */
  let {
    methods,
    action,
    submit,
    buttonLabel,
    captcha,
    captchaAlways = false,
    result,
    hidden,
  }: {
    methods: MethodView[];
    action: string;
    /** The submit button of a method's form. */
    submit: string;
    /** The text of an option's (or a button-only method's) button. */
    buttonLabel: (label: string) => string;
    captcha?: PublicCaptcha;
    /** Forms with fields always carry the captcha. */
    captchaAlways?: boolean;
    /** The refused attempt: which method, what was typed, whether a captcha is wanted. */
    result?: {
      method?: string;
      values?: Record<string, string>;
      captcha?: boolean;
    } | null;
    /** Hidden fields sent with every form. */
    hidden?: Snippet;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  /** A heading per form tells several forms apart. */
  const titled = $derived(
    methods.filter((method) => method.fields.length).length > 1,
  );
  const showCaptcha = (method: MethodView) =>
    !!captcha &&
    captcha.provider !== 'none' &&
    ((captchaAlways && method.fields.length > 0) ||
      (result?.captcha === true && result.method === method.id));
</script>

{#each methods as method, index (method.id)}
  {@const previous = methods[index - 1]}
  {#if previous && (method.fields.length || previous.fields.length)}
    <div class="flex items-center gap-3 text-xs text-muted-foreground">
      <Separator class="flex-1" />
      {m.or}
      <Separator class="flex-1" />
    </div>
  {/if}
  {#if method.fields.length}
    <!-- Not enhanced: a captcha widget must render fresh after each attempt. -->
    <AuthForm {action} {submit}>
      {@render hidden?.()}
      <input type="hidden" name="method" value={method.id} />
      {#if titled}<p class="text-sm font-medium">
          {methodLabel(m, method)}
        </p>{/if}
      <SignInFields
        fields={method.fields}
        prefix="method-{index}"
        values={result?.method === method.id ? result.values : undefined}
      />
      {#if showCaptcha(method) && captcha}
        <Captcha {captcha} />
      {/if}
    </AuthForm>
  {:else}
    <SsoButtons
      {action}
      name="option"
      options={method.options.length
        ? method.options
        : [{ id: '', label: methodLabel(m, method) }]}
      label={buttonLabel}
    >
      {@render hidden?.()}
      <input type="hidden" name="method" value={method.id} />
      {#if showCaptcha(method) && captcha}
        <Captcha {captcha} />
      {/if}
    </SsoButtons>
  {/if}
{/each}
