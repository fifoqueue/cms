<script lang="ts">
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { CAPABILITIES, ROLES } from '@cms/sdk/capabilities';
  let roleKey = $state('');
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import { Search } from '@lucide/svelte';
  import BulkReport from '#lib/admin/BulkReport.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '#lib/components/ui/table/index.js';
  import { roleLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const selectedRole = $derived(
    data.roles.find((role) => role.key === roleKey),
  );

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const values = $derived(form && 'values' in form ? form.values : undefined);
  // svelte-ignore state_referenced_locally
  let invite = $state(values?.invite ?? true);

  const roleName = (key: string) => {
    const label = roleLabel(m, key);
    return label === key
      ? (data.roles.find((role) => role.key === key)?.name ?? key)
      : label;
  };

  /** A view link keeping the search. */
  const view = (role?: string): `?${string}` => {
    const params = new SvelteURLSearchParams();
    if (role) params.set('role', role);
    if (data.filter.q) params.set('q', data.filter.q);
    return `?${params}`;
  };

  let selected = $state<string[]>([]);
  let action = $state('');
  const selectable = $derived(
    data.users.filter((user) => user.id !== data.user.id).map(({ id }) => id),
  );
  const names = $derived(
    new Map(data.everyone.map((user) => [user.id, user.name])),
  );
  const bulkResult = $derived(
    form && 'bulk' in form
      ? (form.bulk as {
          done: number;
          failed: { id: string; message: string }[];
        })
      : null,
  );

  const confirmBulk: SubmitFunction = ({ formData, cancel }) => {
    if (
      formData.get('action') === 'delete' &&
      !confirm(m.usersBulkDeleteConfirm)
    )
      return cancel();
    return async ({ update }) => {
      selected = [];
      await update();
    };
  };
</script>

<svelte:head><title>{m.usersTitle}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.usersTitle}</h1>
<FormMessage {form} />

<BulkReport result={bulkResult} {names} />

<nav class="flex flex-wrap gap-2 text-sm" aria-label={m.role}>
  <a
    href={resolve(`/admin/(app)/users${view()}`)}
    aria-current={!data.filter.role}
    class="filter"
    >{m.anyStatus} <span class="text-muted-foreground">({data.total})</span></a
  >
  {#each data.roles.filter((role) => data.counts[role.key]) as role (role.key)}
    <a
      href={resolve(`/admin/(app)/users${view(role.key)}`)}
      aria-current={data.filter.role === role.key}
      class="filter"
      >{roleName(role.key)}
      <span class="text-muted-foreground">({data.counts[role.key]})</span></a
    >
  {/each}
</nav>

<div class="flex flex-wrap items-end justify-between gap-2">
  <form
    id="bulk-users"
    method="POST"
    action="?/bulk"
    use:enhance={confirmBulk}
    class="flex flex-wrap items-center gap-2"
  >
    <label class="sr-only" for="users-action">{m.bulkActions}</label>
    <NativeSelect id="users-action" name="action" size="sm" bind:value={action}>
      <NativeSelectOption value="">{m.bulkActions}</NativeSelectOption>
      <NativeSelectOption value="role">{m.usersChangeRole}</NativeSelectOption>
      <NativeSelectOption value="delete">{m.delete}</NativeSelectOption>
    </NativeSelect>
    {#if action === 'role'}
      <label class="sr-only" for="users-role">{m.role}</label>
      <NativeSelect id="users-role" name="role" size="sm" required>
        <NativeSelectOption value="">{m.usersChangeRoleTo}</NativeSelectOption>
        {#each data.roles as role (role.key)}
          <NativeSelectOption value={role.key}
            >{roleName(role.key)}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    {:else if action === 'delete'}
      <label class="sr-only" for="users-reassign">{m.usersReassign}</label>
      <NativeSelect id="users-reassign" name="reassignTo" size="sm">
        <NativeSelectOption value="">{m.usersDeleteContent}</NativeSelectOption>
        {#each data.everyone.filter((user) => !selected.includes(user.id)) as user (user.id)}
          <NativeSelectOption value={user.id}
            >{m.usersReassignTo(user.name)}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    {/if}
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={!selected.length || !action}>{m.apply}</Button
    >
  </form>
  <form method="GET" role="search" class="flex gap-2" aria-label={m.search}>
    {#if data.filter.role}<input
        type="hidden"
        name="role"
        value={data.filter.role}
      />{/if}
    <Input
      name="q"
      type="search"
      maxlength={200}
      value={data.filter.q ?? ''}
      placeholder={m.usersSearch}
      aria-label={m.usersSearch}
      class="w-56"
    />
    <Button type="submit" variant="outline"
      ><Search class="size-4" /> {m.search}</Button
    >
  </form>
</div>

<Card>
  <CardContent class="p-0">
    {#if data.users.length}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-8">
              <input
                type="checkbox"
                aria-label={m.selectAll}
                checked={selectable.length > 0 &&
                  selected.length === selectable.length}
                onchange={(event) =>
                  (selected = event.currentTarget.checked ? selectable : [])}
              />
            </TableHead>
            <TableHead>{m.name}</TableHead>
            <TableHead class="hidden sm:table-cell">{m.email}</TableHead>
            <TableHead>{m.role}</TableHead>
            <TableHead class="hidden text-right md:table-cell"
              >{m.usersEntries}</TableHead
            >
            <TableHead class="hidden md:table-cell">{m.usersJoined}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.users as user (user.id)}
            {@const self = user.id === data.user.id}
            <TableRow>
              <TableCell class="align-top">
                {#if !self}
                  <input
                    type="checkbox"
                    form="bulk-users"
                    name="ids"
                    value={user.id}
                    aria-label={m.selectItem(user.name)}
                    bind:group={selected}
                  />
                {/if}
              </TableCell>
              <TableCell class="whitespace-normal">
                <a
                  class="font-medium hover:underline"
                  href={resolve('/admin/(app)/users/[id]', { id: user.id })}
                  >{user.name}</a
                >
                {#if self}
                  <Badge variant="secondary" class="ml-2">{m.usersYou}</Badge>
                {/if}
                <p class="text-xs break-all text-muted-foreground sm:hidden">
                  {user.email}
                </p>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <a
                    href={resolve('/admin/(app)/users/[id]', { id: user.id })}
                    class="text-primary hover:underline">{m.edit}</a
                  >
                  {#if !self}
                    <a
                      href="{resolve('/admin/(app)/users/[id]', {
                        id: user.id,
                      })}#delete"
                      class="text-destructive hover:underline">{m.delete}</a
                    >
                  {/if}
                  <form method="POST" action="?/reset" use:enhance>
                    <input type="hidden" name="id" value={user.id} />
                    <button type="submit" class="text-primary hover:underline"
                      >{m.usersSendReset}</button
                    >
                  </form>
                </div>
              </TableCell>
              <TableCell class="hidden break-all sm:table-cell"
                >{user.email}</TableCell
              >
              <TableCell>{roleName(user.role)}</TableCell>
              <TableCell class="hidden text-right md:table-cell">
                {#if user.contentCount}
                  <a
                    href={resolve(
                      `/admin/(app)/content?author=${encodeURIComponent(user.slug)}`,
                    )}
                    class="hover:underline"
                    aria-label={m.usersEntriesOf(user.name, user.contentCount)}
                    >{user.contentCount}</a
                  >
                {:else}0{/if}
              </TableCell>
              <TableCell class="hidden md:table-cell"
                >{new Date(user.createdAt).toLocaleDateString(
                  i18n.language,
                )}</TableCell
              >
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    {:else}
      <p class="p-6 text-sm text-muted-foreground">{m.usersEmpty}</p>
    {/if}
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.usersAdd}</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/create"
      use:enhance
      class="grid gap-4 sm:grid-cols-2"
    >
      <div class="grid gap-2">
        <Label for="name">{m.name}</Label>
        <Input
          id="name"
          name="name"
          required
          maxlength={191}
          autocomplete="off"
          value={values?.name ?? ''}
        />
      </div>
      <div class="grid gap-2">
        <Label for="email">{m.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          maxlength={191}
          autocomplete="off"
          value={values?.email ?? ''}
        />
      </div>
      <div class="grid gap-2">
        <Label for="role">{m.role}</Label>
        <NativeSelect
          class="w-full"
          id="role"
          name="role"
          value={values?.role ?? 'author'}
        >
          {#each data.roles as role (role.key)}
            <NativeSelectOption value={role.key}
              >{roleLabel(m, role.key) === role.key
                ? role.name
                : roleLabel(m, role.key)}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <label class="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="invite" bind:checked={invite} />
        {m.usersInvite}
      </label>
      {#if !invite}
        <div class="grid gap-2">
          <Label for="password">{m.password}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minlength={8}
            maxlength={200}
            autocomplete="new-password"
          />
        </div>
      {/if}
      <div class="sm:col-span-2">
        <Button type="submit">{m.usersAdd}</Button>
      </div>
    </form>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.membershipTitle}</CardTitle></CardHeader>
  <CardContent>
    <form method="POST" action="?/membership" use:enhance class="space-y-3">
      <label class="flex items-center gap-2"
        ><input
          name="enabled"
          type="checkbox"
          checked={data.membership.enabled}
        />{m.membershipEnable}</label
      >
      <p class="text-sm text-muted-foreground">{m.membershipHelp}</p>
      <Button type="submit">{m.save}</Button>
    </form>
  </CardContent>
</Card>
<Card>
  <CardHeader><CardTitle>{m.rolesTitle}</CardTitle></CardHeader>
  <CardContent>
    <form method="POST" action="?/role" use:enhance class="space-y-3">
      <label class="grid gap-1"
        >{m.rolesSelect}
        <NativeSelect bind:value={roleKey}>
          <NativeSelectOption value="">{m.rolesNew}</NativeSelectOption>
          {#each data.roles.filter((role) => !(ROLES as readonly string[]).includes(role.key)) as role (role.key)}
            <NativeSelectOption value={role.key}>{role.name}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </label>
      {#key roleKey}
        <label class="grid gap-1"
          >{m.rolesKey}<Input
            name="key"
            value={selectedRole?.key ?? ''}
            required
            maxlength={32}
            readonly={!!selectedRole}
          /></label
        >
        <label class="grid gap-1"
          >{m.name}<Input
            name="name"
            value={selectedRole?.name ?? ''}
            required
            maxlength={100}
          /></label
        >
        <fieldset class="grid gap-2 sm:grid-cols-2">
          <legend class="mb-2">{m.rolesPermissions}</legend>
          {#each CAPABILITIES as capability (capability)}
            <label class="flex items-center gap-2 text-sm"
              ><input
                type="checkbox"
                name="capability"
                value={capability}
                checked={selectedRole?.capabilities.includes(capability)}
              />{m.capabilityLabel(capability)}</label
            >
          {/each}
        </fieldset>
      {/key}
      <Button type="submit">{m.save}</Button>
    </form>
    {#if selectedRole}
      <form
        method="POST"
        action="?/deleteRole"
        use:enhance={({ cancel }) => {
          if (!confirm(m.rolesDeleteConfirm(selectedRole.name)))
            return cancel();
          return async ({ update }) => {
            roleKey = '';
            await update();
          };
        }}
        class="mt-6 flex flex-wrap items-end gap-3 border-t pt-4"
      >
        <input type="hidden" name="key" value={selectedRole.key} />
        <div class="grid gap-1">
          <Label for="role-reassign">{m.rolesReassign}</Label>
          <NativeSelect id="role-reassign" name="reassignTo" required>
            {#each data.roles.filter((role) => role.key !== selectedRole.key) as role (role.key)}
              <NativeSelectOption value={role.key}
                >{roleName(role.key)}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>
        <Button type="submit" variant="destructive">{m.rolesDelete}</Button>
      </form>
    {/if}
  </CardContent>
</Card>

<style>
  .filter {
    border-radius: var(--radius);
    padding: 0.25rem 0.75rem;
  }
  .filter[aria-current='true'] {
    background: var(--muted);
    font-weight: 500;
  }
</style>
