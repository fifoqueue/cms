<script lang="ts">
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import PageOptions from '#lib/admin/settings/PageOptions.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { NativeSelect } from '#lib/components/ui/native-select/index.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<svelte:head><title>{m.privacySettings}</title></svelte:head>
<h1 class="text-2xl font-semibold">{m.privacySettings}</h1>
<FormMessage {form} />
<SettingsForm
  action="?/save"
  reset
  class="grid max-w-xl gap-6 rounded-lg border bg-card p-6"
>
  <label class="grid gap-2"
    >{m.privacyPolicyPage}<NativeSelect
      name="policyPageId"
      value={data.privacy.policyPageId ?? ''}
      ><PageOptions pages={data.pages} empty={m.none} /></NativeSelect
    ></label
  >
  <label class="flex items-start gap-2 text-sm"
    ><input
      type="checkbox"
      name="commentCookies"
      checked={data.privacy.commentCookies}
    />{m.privacyCommentCookies}</label
  >
  <div><Button type="submit">{m.save}</Button></div>
</SettingsForm>
