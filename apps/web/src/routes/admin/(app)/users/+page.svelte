<script lang="ts">
  import { CAPABILITIES, ROLES } from '@cms/sdk/capabilities';
  let roleKey = $state('');
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
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
</script>

<svelte:head><title>{m.usersTitle}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.usersTitle}</h1>
<FormMessage {form} />

<Card>
  <CardContent class="p-0">
    {#if data.users.length}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.name}</TableHead>
            <TableHead>{m.email}</TableHead>
            <TableHead>{m.role}</TableHead>
            <TableHead class="text-right">{m.usersEntries}</TableHead>
            <TableHead>{m.usersJoined}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each data.users as user (user.id)}
            <TableRow>
              <TableCell>
                <a
                  class="font-medium hover:underline"
                  href={resolve('/admin/(app)/users/[id]', { id: user.id })}
                  >{user.name}</a
                >
                {#if user.id === data.user.id}
                  <Badge variant="secondary" class="ml-2">{m.usersYou}</Badge>
                {/if}
              </TableCell>
              <TableCell class="break-all">{user.email}</TableCell>
              <TableCell>{roleLabel(m, user.role)}</TableCell>
              <TableCell class="text-right">{user.contentCount}</TableCell>
              <TableCell
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
      <div class="grid gap-2">
        <Label for="password">{m.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minlength={8}
          maxlength={200}
          autocomplete="new-password"
          aria-describedby="password-help"
        />
        <p id="password-help" class="text-xs text-muted-foreground">
          {m.usersPasswordHelp}
        </p>
      </div>
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
  </CardContent>
</Card>
