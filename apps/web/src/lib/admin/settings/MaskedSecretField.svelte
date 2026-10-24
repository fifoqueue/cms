<script lang="ts">
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';

  let {
    name,
    label,
    configured,
    removeName,
    removeLabel,
    class: className = 'grid gap-2',
  }: {
    name: string;
    label: string;
    configured: boolean;
    removeName: string;
    removeLabel: string;
    class?: string;
  } = $props();
</script>

<div class={className}>
  <Label for={name}>{label}</Label>
  <Input
    id={name}
    {name}
    type="password"
    autocomplete="off"
    placeholder={configured ? '••••••••' : ''}
  />
  {#if configured}
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name={removeName} />
      {removeLabel}
    </label>
  {/if}
</div>
