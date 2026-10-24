<script lang="ts">
  import { CALLOUT_VARIANTS } from '@cms/sdk';
  import type { CalloutAttributes } from '@cms/sdk';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import '#lib/theme/content/callout.css';

  /** The selected callout's attributes; `onchange` names only what changed, so the body stays. */
  let {
    attrs,
    onchange,
  }: {
    attrs: Record<string, unknown>;
    onchange: (attrs: CalloutAttributes) => void;
  } = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<label class="grid gap-1"
  >{m.contentCalloutVariant}<NativeSelect
    value={String(attrs.variant)}
    onchange={(event) => {
      const variant = CALLOUT_VARIANTS.find(
        (name) => name === event.currentTarget.value,
      );
      if (variant) onchange({ variant });
    }}
  >
    {#each CALLOUT_VARIANTS as variant (variant)}<NativeSelectOption
        value={variant}
        >{m.contentCalloutVariantName(variant)}</NativeSelectOption
      >{/each}
  </NativeSelect></label
>
<label class="flex items-center gap-2"
  ><input
    type="checkbox"
    checked={attrs.dismissible === true}
    onchange={(event) => onchange({ dismissible: event.currentTarget.checked })}
  />{m.contentCalloutDismissible}</label
>
