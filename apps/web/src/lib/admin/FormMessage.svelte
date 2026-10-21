<script lang="ts">
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '#lib/components/ui/alert/index.js';

  interface Issue {
    path: string;
    message: string;
  }

  let {
    form,
  }: { form?: { message?: string; issues?: unknown; notice?: string } | null } =
    $props();

  const issues = $derived(
    Array.isArray(form?.issues) ? (form.issues as Issue[]) : [],
  );
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
{:else if form?.notice}
  <Alert>
    <AlertTitle>{form.notice}</AlertTitle>
  </Alert>
{/if}
