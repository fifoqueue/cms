<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
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
<form
  method="POST"
  action="?/save"
  use:enhance
  class="grid max-w-xl gap-6 rounded-lg border bg-card p-6"
>
  <label class="grid gap-2"
    >{m.privacyPolicyPage}<NativeSelect
      name="policyPageId"
      value={data.privacy.policyPageId ?? ''}
      ><NativeSelectOption value="">{m.none}</NativeSelectOption
      >{#each data.pages as page (page.id)}<NativeSelectOption value={page.id}
          >{page.title}</NativeSelectOption
        >{/each}</NativeSelect
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
</form>
