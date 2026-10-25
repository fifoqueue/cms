<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import PasswordInput from '#lib/security/PasswordInput.svelte';
  import type { FieldView } from '#lib/server/sign-in-view.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { fieldLabel } from '#lib/sign-in-labels.js';

  /** The inputs a sign-in method or step declares, whatever provides it. */
  let {
    fields,
    prefix,
    values = {},
  }: {
    fields: FieldView[];
    /** Makes the ids unique on a page with several forms. */
    prefix: string;
    /** What the visitor typed before a refusal (never passwords or codes). */
    values?: Record<string, string>;
  } = $props();

  const i18n = useI18n();

  type AutoFill = HTMLInputAttributes['autocomplete'];

  const id = (name: string) =>
    `${prefix}-${name}`.replace(/[^A-Za-z0-9_-]/g, '-');
  /** Same as `FIELD_PREFIX` (`#lib/server/sign-in-view.js`), which reads them back. */
  const input = (name: string) => `field.${name}`;
  const autocomplete = (field: FieldView): AutoFill =>
    (field.autocomplete ??
      {
        email: 'username',
        password: 'current-password',
        code: 'one-time-code',
        text: 'off',
      }[field.type]) as AutoFill;
</script>

{#each fields as field (field.name)}
  <div class="grid gap-2">
    <Label for={id(field.name)}>{fieldLabel(i18n.m, field)}</Label>
    {#if field.type === 'password'}
      <PasswordInput
        id={id(field.name)}
        name={input(field.name)}
        autocomplete={autocomplete(field)}
        required={field.required}
        maxlength={2000}
      />
    {:else if field.type === 'code'}
      <Input
        id={id(field.name)}
        name={input(field.name)}
        autocomplete={autocomplete(field)}
        autocapitalize="off"
        spellcheck={false}
        maxlength={2000}
        class="font-mono"
        required={field.required}
      />
    {:else}
      <Input
        id={id(field.name)}
        name={input(field.name)}
        type={field.type === 'email' ? 'email' : 'text'}
        autocomplete={autocomplete(field)}
        maxlength={2000}
        required={field.required}
        value={values[field.name] ?? ''}
      />
    {/if}
  </div>
{/each}
