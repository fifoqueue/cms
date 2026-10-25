<script lang="ts">
  import { enhance } from '$app/forms';
  import PluginProfileFields from '#lib/admin/PluginProfileFields.svelte';
  import { profileFieldRows } from '#lib/admin/plugin-profile-fields.js';
  import type { ProfileMeta } from '#lib/admin/plugin-profile-fields.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** "추가 정보": private fields plugins declare for a user; nothing when none does. */
  let {
    meta,
    typed,
    issues,
  }: {
    meta: ProfileMeta;
    /** What was typed before a refusal. */
    typed?: Record<string, string | boolean>;
    /** Issue messages by field key. */
    issues?: Partial<Record<string, string>>;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const rows = $derived(profileFieldRows(meta, typed));
</script>

{#if rows.length}
  <Card>
    <CardHeader>
      <CardTitle>{m.profileFieldsTitle}</CardTitle>
      <CardDescription>{m.profileFieldsHelp}</CardDescription>
    </CardHeader>
    <CardContent>
      <form
        method="POST"
        action="?/profileFields"
        class="grid gap-4"
        novalidate
        use:enhance={() =>
          ({ update }) =>
            update({ reset: false })}
      >
        <PluginProfileFields {rows} {issues} />
        <div><Button type="submit">{m.save}</Button></div>
      </form>
    </CardContent>
  </Card>
{/if}
