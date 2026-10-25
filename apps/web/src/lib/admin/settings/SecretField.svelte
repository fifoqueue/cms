<script lang="ts">
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    name,
    label,
    configured,
    removeName,
    helpId,
    maxlength = 500,
    error,
    help,
  }: {
    name: string;
    label: string;
    configured: boolean;
    /** The removal box's name; without it a saved secret can only be replaced. */
    removeName?: string;
    helpId: string;
    maxlength?: number;
    /** A field issue, shown under the input. */
    error?: string;
    /** Replaces the "leave empty to keep" hint. */
    help?: string;
  } = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<div class="grid gap-2">
  <Label for={name} class="flex items-center gap-2">
    {label}
    {#if configured}
      <Badge variant="secondary">{m.secretSaved}</Badge>
    {/if}
  </Label>
  <Input
    id={name}
    {name}
    type="password"
    autocomplete="off"
    {maxlength}
    aria-invalid={error ? true : undefined}
    aria-describedby={error ? `${helpId} ${name}-error` : helpId}
  />
  {#if error}
    <p id="{name}-error" class="text-xs text-destructive">{error}</p>
  {/if}
  <p id={helpId} class="text-xs text-muted-foreground">
    {help ?? m.secretKeep}
  </p>
  {#if configured && removeName}
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name={removeName} />
      {m.secretRemove}
    </label>
  {/if}
</div>
