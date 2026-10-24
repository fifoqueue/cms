<script lang="ts">
  import { NativeSelectOption } from '#lib/components/ui/native-select/index.js';
  import { roleLabel, useI18n } from '#lib/i18n/index.js';

  let { roles }: { roles: readonly { key: string; name: string }[] } = $props();
  const i18n = useI18n();
</script>

{#each roles as role (role.key)}
  {@const label = roleLabel(i18n.m, role.key)}
  <NativeSelectOption value={role.key}
    >{label === role.key ? role.name : label}</NativeSelectOption
  >
{/each}
