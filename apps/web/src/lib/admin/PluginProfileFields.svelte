<script lang="ts">
  import { issueText } from '#lib/admin/form-errors.js';
  import { PROFILE_FIELD_PREFIX } from '#lib/admin/plugin-profile-fields.js';
  import type { ProfileFieldRow } from '#lib/admin/plugin-profile-fields.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * Private per-user fields plugins declare, rendered the same way whatever plugin provides them;
   * nothing when none does. Inputs post as `profile.<key>`.
   */
  let {
    rows,
    issues = {},
  }: {
    rows: ProfileFieldRow[];
    /** API issue messages by field key. */
    issues?: Partial<Record<string, string>>;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = (index: number) => `plugin-profile-${index}`;
</script>

{#each rows as row, index (row.key)}
  {@const issue = issues[row.key]}
  {@const describedBy = issue ? `${id(index)}-error` : undefined}
  <div class="grid gap-2">
    {#if row.type === 'boolean'}
      <label class="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="checkbox"
          id={id(index)}
          name={PROFILE_FIELD_PREFIX + row.key}
          checked={row.value}
          aria-invalid={issue ? true : undefined}
          aria-describedby={describedBy}
        />
        <span class="font-medium">{row.label}</span>
        <Badge variant="outline">{m.pluginFieldSource(row.source)}</Badge>
      </label>
    {:else}
      <div class="flex flex-wrap items-center gap-2">
        <Label for={id(index)}>{row.label}</Label>
        <Badge variant="outline">{m.pluginFieldSource(row.source)}</Badge>
      </div>
      {#if row.type === 'text'}
        <Input
          id={id(index)}
          name={PROFILE_FIELD_PREFIX + row.key}
          maxlength={row.maxLength}
          value={row.value}
          aria-invalid={issue ? true : undefined}
          aria-describedby={describedBy}
        />
      {:else}
        <Input
          id={id(index)}
          name={PROFILE_FIELD_PREFIX + row.key}
          type="number"
          step="any"
          min={row.min}
          max={row.max}
          value={row.value}
          aria-invalid={issue ? true : undefined}
          aria-describedby={describedBy}
        />
      {/if}
    {/if}
    {#if issue}
      <p id="{id(index)}-error" class="text-xs text-destructive">
        {issueText(m, i18n.language, issue)}
      </p>
    {/if}
  </div>
{/each}
