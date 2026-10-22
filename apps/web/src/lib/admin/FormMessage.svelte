<script lang="ts">
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '#lib/components/ui/alert/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Issue {
    path: string;
    message: string;
  }

  let {
    form,
  }: { form?: { message?: string; issues?: unknown; notice?: string } | null } =
    $props();

  const i18n = useI18n();

  const issues = $derived(
    Array.isArray(form?.issues) ? (form.issues as Issue[]) : [],
  );

  /** Actions may return a catalog key as their notice; other text is shown as is. */
  const notice = $derived.by(() => {
    const value = form?.notice;
    if (!value) return '';
    const entry = (i18n.m as Record<string, unknown>)[value];
    return typeof entry === 'string' ? entry : value;
  });
</script>

{#if form?.message}
  <Alert variant="destructive">
    <AlertTitle>{form.message}</AlertTitle>
    {#if issues.length}
      <AlertDescription>
        <ul class="list-disc pl-4">
          {#each issues as issue (issue.path + issue.message)}
            <li>{issue.path ? `${issue.path}: ` : ''}{issue.message}</li>
          {/each}
        </ul>
      </AlertDescription>
    {/if}
  </Alert>
{:else if notice}
  <Alert>
    <AlertTitle>{notice}</AlertTitle>
  </Alert>
{/if}
