<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { roleLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const target = $derived(data.target);
  const isSelf = $derived(target.id === data.user.id);

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
</script>

<svelte:head><title>{target.name}</title></svelte:head>

<h1 class="text-2xl font-semibold">{target.name}</h1>
<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.profileTitle}</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      action="?/save"
      use:enhance={() =>
        ({ update }) =>
          update({ reset: false })}
      class="grid gap-4 sm:grid-cols-2"
    >
      <div class="grid gap-2">
        <Label for="name">{m.name}</Label>
        <Input
          id="name"
          name="name"
          required
          maxlength={191}
          value={target.name}
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
          value={target.email}
        />
      </div>
      <div class="grid gap-2">
        <Label for="slug">{m.slug}</Label>
        <Input
          id="slug"
          name="slug"
          required
          maxlength={191}
          value={target.slug}
          aria-describedby="slug-help"
        />
        <p id="slug-help" class="text-xs text-muted-foreground">
          {m.profileSlugHelp}
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="role">{m.role}</Label>
        <NativeSelect class="w-full" id="role" name="role" value={target.role}>
          {#each data.roles as role (role.key)}
            <NativeSelectOption value={role.key}
              >{roleLabel(m, role.key) === role.key
                ? role.name
                : roleLabel(m, role.key)}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-2 sm:col-span-2">
        <Label for="bio">{m.bio}</Label>
        <Textarea id="bio" name="bio" maxlength={2000} value={target.bio} />
      </div>
      <div class="sm:col-span-2">
        <Button type="submit">{m.save}</Button>
      </div>
    </form>
  </CardContent>
</Card>

{#if !isSelf}
  <Card>
    <CardHeader
      ><CardTitle>{m.usersDeleteTitle(target.name)}</CardTitle></CardHeader
    >
    <CardContent>
      <form
        method="POST"
        action="?/delete"
        use:enhance={confirmDelete}
        class="flex flex-wrap items-end gap-4"
      >
        <div class="grid gap-2">
          <Label for="reassignTo">{m.usersReassign}</Label>
          <NativeSelect id="reassignTo" name="reassignTo">
            <NativeSelectOption value=""
              >{m.usersDeleteContent}</NativeSelectOption
            >
            {#each data.others as other (other.id)}
              <NativeSelectOption value={other.id}
                >{other.name}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>
        <Button type="submit" variant="destructive">{m.delete}</Button>
      </form>
    </CardContent>
  </Card>
{/if}
