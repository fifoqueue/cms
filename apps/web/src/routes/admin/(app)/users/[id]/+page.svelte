<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import PluginProfileFieldsCard from '#lib/admin/PluginProfileFieldsCard.svelte';
  import {
    profileFieldsRefusal,
    splitProfileIssues,
  } from '#lib/admin/plugin-profile-fields.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import ProfileFields from '#lib/admin/ProfileFields.svelte';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import RoleOptions from '#lib/admin/RoleOptions.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const target = $derived(data.target);
  const isSelf = $derived(target.id === data.user.id);

  /** A refused save of the plugin profile fields; its field issues show next to the fields. */
  const profileRefusal = $derived(profileFieldsRefusal(form));
  const profileIssues = $derived(
    splitProfileIssues(profileRefusal?.issues ?? [], data.profileFields),
  );

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
</script>

<svelte:head><title>{target.name}</title></svelte:head>

<h1 class="text-2xl font-semibold">{target.name}</h1>
<FormMessage
  form={profileRefusal
    ? { ...profileRefusal, issues: profileIssues.apart }
    : form}
/>

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
      <ProfileFields profile={target}>
        <div class="grid gap-2">
          <Label for="role">{m.role}</Label>
          <NativeSelect
            class="w-full"
            id="role"
            name="role"
            value={target.role}
          >
            <RoleOptions roles={data.roles} />
          </NativeSelect>
        </div>
      </ProfileFields>
      <div class="sm:col-span-2">
        <Button type="submit">{m.save}</Button>
      </div>
    </form>
  </CardContent>
</Card>

<PluginProfileFieldsCard
  meta={data.profileFields}
  typed={profileRefusal?.typed}
  issues={profileIssues.placed}
/>

<Card>
  <CardHeader><CardTitle>{m.usersAccountManagement}</CardTitle></CardHeader>
  <CardContent class="flex flex-wrap gap-2">
    <form method="POST" action="?/reset" use:enhance>
      <Button type="submit" variant="outline"
        >{data.passwordAllowed
          ? m.usersSendReset
          : m.usersSendSignInLink}</Button
      >
    </form>
    {#if !isSelf}
      <form
        method="POST"
        action="?/signOut"
        use:enhance={({ cancel }) => {
          if (!confirm(m.usersSignOutConfirm(target.name))) cancel();
        }}
      >
        <Button type="submit" variant="outline"
          >{m.usersSignOutEverywhere}</Button
        >
      </form>
    {/if}
  </CardContent>
</Card>

{#if !isSelf}
  <Card id="delete">
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
