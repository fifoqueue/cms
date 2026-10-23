<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const rules = $derived(form?.rules ?? data.rules);
</script>

<svelte:head><title>{m.settingsEgress}</title></svelte:head>

<FormMessage {form} />

<form method="POST" use:enhance class="space-y-6">
  <Card>
    <CardHeader>
      <CardTitle>{m.egressTitle}</CardTitle>
      <CardDescription>{m.egressDescription}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-3">
      <Label for="rules">{m.egressRules}</Label>
      <Textarea id="rules" name="rules" rows={10} value={rules} />
      <p class="text-xs text-muted-foreground">{m.egressHelp}</p>
      <Button type="submit">{m.save}</Button>
    </CardContent>
  </Card>

  {#if data.environmentRules}
    <Card>
      <CardHeader>
        <CardTitle>{m.egressEnvironment}</CardTitle>
        <CardDescription>{m.egressEnvironmentHelp}</CardDescription>
      </CardHeader>
      <CardContent>
        <pre
          class="overflow-x-auto whitespace-pre-wrap text-sm">{data.environmentRules}</pre>
      </CardContent>
    </Card>
  {/if}
</form>
