<script lang="ts">
  import { enhance } from '$app/forms';
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
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Settings</title></svelte:head>

<h1 class="text-2xl font-semibold">Settings</h1>
<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>Site</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      use:enhance={() =>
        ({ update }) =>
          update({ reset: false })}
      class="space-y-4"
    >
      <div class="grid gap-2">
        <Label for="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          maxlength={191}
          value={data.site.title}
        />
      </div>
      <div class="grid gap-2">
        <Label for="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          maxlength={500}
          value={data.site.description}
        />
      </div>
      <div class="grid gap-2">
        <Label for="locale">Locale</Label>
        <Input
          id="locale"
          name="locale"
          required
          maxlength={35}
          placeholder="en, ko-KR"
          value={data.site.locale}
        />
      </div>
      <Button type="submit">Save</Button>
    </form>
  </CardContent>
</Card>
