<script lang="ts">
  import { resolve } from '$app/paths';
  import { ArrowDown, ArrowUp } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { issueText } from '#lib/admin/form-errors.js';
  import SettingsForm from '#lib/admin/settings/SettingsForm.svelte';
  import {
    factorRows,
    methodRows,
    moveItem,
    signInIssueTarget,
  } from '#lib/admin/settings/sign-in-form.js';
  import type {
    SignInList,
    SignInRow,
  } from '#lib/admin/settings/sign-in-form.js';
  import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { roleLabel, useI18n } from '#lib/i18n/index.js';
  import { factorLabel, methodLabel } from '#lib/sign-in-labels.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  /** Saved settings, or what was posted when a save was refused (or reordered without scripts). */
  const values = $derived(
    (form && 'values' in form ? form.values : undefined) ?? data.values,
  );
  const posted = $derived(
    form && 'issues' in form && Array.isArray(form.issues) ? form.issues : [],
  );
  /** Issue texts by `<list>` or `<list>:<id>`, the first per target; the rest is listed apart. */
  const placement = $derived.by(() => {
    const placed: Partial<Record<string, string>> = {};
    const apart: typeof posted = [];
    for (const issue of posted) {
      const target = signInIssueTarget(issue.path, values);
      if (target)
        placed[
          target.id === null ? target.list : `${target.list}:${target.id}`
        ] ??= issueText(m, i18n.language, issue.message);
      else apart.push(issue);
    }
    return { placed, apart };
  });
  const summary = $derived(
    form && 'message' in form ? { ...form, issues: placement.apart } : form,
  );
  const issue = (list: SignInList, id?: string) =>
    placement.placed[id === undefined ? list : `${list}:${id}`];

  /** The order and allowed methods on the page; moving and toggling with scripts edits these. */
  let order = $derived([...values.order]);
  let allowed = $derived([...values.methods]);
  const methods = $derived(
    methodRows(order, data.available.methods).map((row) => ({
      ...row,
      label: methodLabel(m, row),
    })),
  );
  const factors = $derived(
    factorRows(values.secondFactors, data.available.secondFactors).map(
      (row) => ({ ...row, label: factorLabel(m, row) }),
    ),
  );
  const roles = $derived([
    ...data.roles,
    ...values.requireSecondFactor
      .filter((key) => !data.roles.some((role) => role.key === key))
      .map((key) => ({ key, name: key })),
  ]);

  const move = (event: MouseEvent, index: number, offset: -1 | 1) => {
    event.preventDefault();
    order = moveItem(order, index, offset);
  };
  const toggle = (id: string, checked: boolean) => {
    allowed = checked
      ? order.filter((item) => item === id || allowed.includes(item))
      : allowed.filter((item) => item !== id);
  };

  /** Password is the core method; turning it off leaves only the other methods. */
  const passwordOff = $derived(
    !data.passwordForced && !allowed.includes('password'),
  );

  const sourceText = (row: SignInRow) =>
    row.source === null
      ? m.signInSourceMissing
      : row.source === 'core'
        ? null
        : m.signInSourcePlugin(row.source);
</script>

<svelte:head><title>{m.settingsSignIn}</title></svelte:head>

{#snippet problem(id: string, text: string | undefined)}
  {#if text}<p {id} class="text-xs text-destructive">{text}</p>{/if}
{/snippet}

{#snippet source(row: SignInRow)}
  {@const text = sourceText(row)}
  {#if text}<Badge variant={row.source === null ? 'destructive' : 'outline'}
      >{text}</Badge
    >{/if}
{/snippet}

<FormMessage form={summary} />

{#if data.passwordForced}
  <Alert>
    <AlertDescription>{m.signInPasswordForced}</AlertDescription>
  </Alert>
{/if}

<SettingsForm action="?/save" novalidate class="grid gap-6">
  <!-- The default button: Enter saves instead of moving the first method. -->
  <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true"
  ></button>

  <Card>
    <CardHeader>
      <CardTitle>{m.signInMethodsTitle}</CardTitle>
      <CardDescription>{m.signInMethodsHelp}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      {#if passwordOff}
        <Alert variant="destructive">
          <AlertDescription>{m.signInPasswordOff}</AlertDescription>
        </Alert>
      {/if}
      {@render problem('methods-error', issue('methods'))}
      <ol class="divide-y rounded-md border">
        {#each methods as row, index (row.id)}
          {@const id = `method-${index}`}
          {@const text = issue('methods', row.id)}
          <li class="grid gap-2 p-3">
            <input type="hidden" name="order" value={row.id} />
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="methods"
                  value={row.id}
                  checked={allowed.includes(row.id)}
                  aria-invalid={text ? true : undefined}
                  aria-describedby={text ? `${id}-error` : undefined}
                  onchange={(event) =>
                    toggle(row.id, event.currentTarget.checked)}
                />
                <span class="font-medium">{row.label}</span>
                {@render source(row)}
                {#if row.source !== null && !row.ready}
                  <Badge variant="secondary">{m.signInNotReady}</Badge>
                {/if}
              </label>
              <div class="flex gap-1">
                <!-- Without scripts, posts the form back reordered (nothing is saved). -->
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  formaction="?/move"
                  name="move"
                  value="{index}:up"
                  disabled={index === 0}
                  aria-label={m.signInMoveUp(row.label)}
                  onclick={(event: MouseEvent) => move(event, index, -1)}
                  ><ArrowUp aria-hidden="true" /></Button
                >
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  formaction="?/move"
                  name="move"
                  value="{index}:down"
                  disabled={index === methods.length - 1}
                  aria-label={m.signInMoveDown(row.label)}
                  onclick={(event: MouseEvent) => move(event, index, 1)}
                  ><ArrowDown aria-hidden="true" /></Button
                >
              </div>
            </div>
            {#if row.source === null}
              <p class="text-xs text-muted-foreground">
                {m.signInMissingHelp}
              </p>
            {:else if !row.ready}
              <p class="text-xs text-muted-foreground">
                {m.signInNotReadyHelp}
                {#if row.id === 'sso'}
                  <a
                    href={resolve('/admin/(app)/settings/sso')}
                    class="text-primary underline-offset-4 hover:underline"
                    >{m.signInSsoSettings}</a
                  >
                {/if}
              </p>
            {/if}
            {@render problem(`${id}-error`, text)}
          </li>
        {/each}
      </ol>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.signInFactorsTitle}</CardTitle>
      <CardDescription>{m.signInFactorsHelp}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-3">
      {@render problem('factors-error', issue('secondFactors'))}
      {#each factors as row, index (row.id)}
        {@const text = issue('secondFactors', row.id)}
        <label class="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="secondFactors"
            value={row.id}
            checked={values.secondFactors.includes(row.id)}
            aria-invalid={text ? true : undefined}
            aria-describedby={text ? `factor-${index}-error` : undefined}
          />
          <span class="font-medium">{row.label}</span>
          {@render source(row)}
        </label>
        {@render problem(`factor-${index}-error`, text)}
      {/each}
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{m.signInRequireTitle}</CardTitle>
      <CardDescription>{m.signInRequireHelp}</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-3">
      {@render problem('roles-error', issue('requireSecondFactor'))}
      {#each roles as role, index (role.key)}
        {@const label = roleLabel(m, role.key)}
        {@const text = issue('requireSecondFactor', role.key)}
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requireSecondFactor"
            value={role.key}
            checked={values.requireSecondFactor.includes(role.key)}
            aria-invalid={text ? true : undefined}
            aria-describedby={text ? `role-${index}-error` : undefined}
          />
          {label === role.key ? role.name : label}
        </label>
        {@render problem(`role-${index}-error`, text)}
      {/each}
    </CardContent>
  </Card>

  <div><Button type="submit">{m.save}</Button></div>
</SettingsForm>
