<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { errorMessage, issueLines } from '#lib/admin/form-errors.js';
  import { confirmLeave } from '#lib/admin/unsaved.js';
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '#lib/components/ui/alert/index.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '#lib/components/ui/table/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  /** The editor's text; a failed or no-script submission returns what was typed. */
  // svelte-ignore state_referenced_locally
  let source = $state(form?.source ?? data.source ?? '');
  /** What the server has stored. */
  // svelte-ignore state_referenced_locally
  let saved = $state(data.source ?? '');
  let busy = $state(false);
  let gutter = $state<HTMLElement>();

  confirmLeave(
    () => data.status.editorEnabled && source !== saved,
    () => m.unsavedLeave,
  );

  const lines = $derived(source.split('\n').length);
  const status = $derived(data.status);
  /** The status the latest save returned: the reload result of that save. */
  const saveStatus = $derived(form && 'status' in form ? form.status : null);
  const failure = $derived(
    form && 'message' in form && form.message
      ? {
          title: errorMessage(i18n.m, i18n.language, form),
          lines: issueLines(
            i18n.m,
            i18n.language,
            Array.isArray(form.issues) ? form.issues : [],
            form.message,
          ),
        }
      : null,
  );

  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
  const hash = (value: string | null) => (value ? value.slice(0, 12) : '—');
  const errorLabel = (code: string) =>
    code === 'activation_failed'
      ? m.functionsActivationFailed
      : code === 'recovery_failed'
        ? m.functionsRecoveryFailed
        : code;
</script>

<svelte:head><title>{m.toolsFunctions}</title></svelte:head>

<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.functionsStatus}</CardTitle></CardHeader>
  <CardContent class="grid gap-4 text-sm">
    <p class="text-muted-foreground">
      {m.functionsCheckedAt(date(status.checkedAt))}
    </p>
    {#if status.sources.length === 0}
      <p>{m.functionsNoSources}</p>
    {:else}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.functionsOwner}</TableHead>
            <TableHead>{m.functionsLoaded}</TableHead>
            <TableHead>{m.functionsObserved}</TableHead>
            <TableHead>{m.functionsLastError}</TableHead>
            <TableHead>{m.functionsUpdated}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each status.sources as entry (entry.owner)}
            <TableRow>
              <TableCell><code>{entry.owner}</code></TableCell>
              <TableCell>
                <code title={entry.loadedHash ?? undefined}
                  >{hash(entry.loadedHash)}</code
                >
                {#if entry.loadedHash === entry.observedHash}
                  <Badge variant="secondary">{m.functionsInSync}</Badge>
                {:else}
                  <Badge variant="destructive">{m.functionsOutOfSync}</Badge>
                {/if}
              </TableCell>
              <TableCell>
                <code title={entry.observedHash}
                  >{hash(entry.observedHash)}</code
                >
              </TableCell>
              <TableCell
                >{entry.lastError
                  ? errorLabel(entry.lastError)
                  : '—'}</TableCell
              >
              <TableCell>{date(entry.updatedAt)}</TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    {/if}
  </CardContent>
</Card>

{#if !status.editorEnabled}
  <Alert>
    <AlertTitle>{m.functionsEditorOff}</AlertTitle>
    <AlertDescription>
      <p>{m.functionsEditorOffHelp}</p>
      <ul class="list-disc pl-4">
        <li><code>FUNCTIONS_EDITOR_ENABLED=true</code></li>
        <li><code>FUNCTIONS_DIR/editor.enabled</code></li>
      </ul>
    </AlertDescription>
  </Alert>
{:else}
  <Card>
    <CardHeader><CardTitle>site.ts</CardTitle></CardHeader>
    <CardContent class="grid gap-4 text-sm">
      <Alert variant="destructive">
        <AlertDescription>{m.functionsWarning}</AlertDescription>
      </Alert>
      <form
        method="POST"
        action="?/validate"
        class="grid gap-4"
        use:enhance={({ action, formData }) => {
          busy = true;
          const submitted = String(formData.get('source') ?? '');

          return async ({ result, update }) => {
            busy = false;

            if (result.type === 'success' && action.search === '?/save')
              saved = submitted;

            await update({ reset: false });

            // On 403 the screen reloads its status and shows the status-only view.
            if (result.type === 'failure' && result.status === 403)
              await invalidateAll();
          };
        }}
      >
        <div
          class="flex max-h-[70vh] min-h-80 overflow-hidden rounded-md border font-mono text-xs leading-5"
        >
          <div
            bind:this={gutter}
            aria-hidden="true"
            class="shrink-0 overflow-hidden border-r bg-muted/50 px-2 py-2 text-right text-muted-foreground select-none"
          >
            {#each { length: lines }, index (index)}
              <div>{index + 1}</div>
            {/each}
          </div>
          <textarea
            name="source"
            aria-label="site.ts"
            aria-invalid={failure ? 'true' : undefined}
            aria-describedby={failure ? 'functions-issues' : undefined}
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            wrap="off"
            bind:value={source}
            onscroll={(event) => {
              if (gutter) gutter.scrollTop = event.currentTarget.scrollTop;
            }}
            class="min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2 outline-none"
          ></textarea>
        </div>
        {#if failure}
          <Alert id="functions-issues" variant="destructive">
            <AlertTitle>{failure.title}</AlertTitle>
            {#if failure.lines.length}
              <AlertDescription>
                <ul class="list-disc pl-4">
                  {#each failure.lines as line, index (index)}
                    <li>{line}</li>
                  {/each}
                </ul>
              </AlertDescription>
            {/if}
          </Alert>
        {/if}
        {#if saveStatus}
          {@const errors = saveStatus.sources.filter(
            (entry) => entry.lastError,
          )}
          {#if errors.length}
            <Alert variant="destructive" role="status">
              <AlertTitle>{m.functionsReloadFailed}</AlertTitle>
              <AlertDescription>
                <ul class="list-disc pl-4">
                  {#each errors as entry (entry.owner)}
                    <li>
                      <code>{entry.owner}</code> — {errorLabel(
                        entry.lastError ?? '',
                      )}
                    </li>
                  {/each}
                </ul>
              </AlertDescription>
            </Alert>
          {:else}
            <Alert role="status">
              <AlertTitle>{m.functionsReloaded}</AlertTitle>
            </Alert>
          {/if}
        {/if}
        <div class="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" disabled={busy}
            >{m.functionsValidate}</Button
          >
          <Button type="submit" formaction="?/save" disabled={busy}
            >{m.save}</Button
          >
          {#if source !== saved}
            <span class="text-muted-foreground">{m.functionsUnsaved}</span>
          {/if}
        </div>
      </form>
    </CardContent>
  </Card>
{/if}
