<script lang="ts">
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    filters,
    selected,
  }: {
    /** Registered list filters of the screen. */
    filters: readonly {
      key: string;
      label: string;
      options: readonly { value: string; label: string }[];
    }[];
    /** The address's `filter.<key>` values. */
    selected: Record<string, string>;
  } = $props();

  const i18n = useI18n();
</script>

<!-- Selects for a GET filter form; each submits as `filter.<key>`. -->
{#each filters as filter (filter.key)}
  <label class="grid gap-1 text-sm">
    <span class="sr-only">{filter.label}</span>
    <NativeSelect
      name={`filter.${filter.key}`}
      value={selected[`filter.${filter.key}`] ?? ''}
      aria-label={filter.label}
    >
      <NativeSelectOption value=""
        >{i18n.m.extensionFilterAny(filter.label)}</NativeSelectOption
      >
      {#each filter.options as option (option.value)}
        <NativeSelectOption value={option.value}
          >{option.label}</NativeSelectOption
        >
      {/each}
    </NativeSelect>
  </label>
{/each}
