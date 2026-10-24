<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  let {
    profile,
    autocomplete = false,
    children,
  }: {
    profile: { name: string; email: string; slug: string; bio: string };
    autocomplete?: boolean;
    children: Snippet;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
</script>

<div class="grid gap-2">
  <Label for="name">{m.name}</Label>
  <Input
    id="name"
    name="name"
    required
    maxlength={191}
    autocomplete={autocomplete ? 'name' : undefined}
    value={profile.name}
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
    autocomplete={autocomplete ? 'email' : undefined}
    value={profile.email}
  />
</div>
<div class="grid gap-2">
  <Label for="slug">{m.slug}</Label>
  <Input
    id="slug"
    name="slug"
    required
    maxlength={191}
    value={profile.slug}
    aria-describedby="slug-help"
  />
  <p id="slug-help" class="text-xs text-muted-foreground">
    {m.profileSlugHelp}
  </p>
</div>
{@render children()}
<div class="grid gap-2 sm:col-span-2">
  <Label for="bio">{m.bio}</Label>
  <Textarea id="bio" name="bio" maxlength={2000} value={profile.bio} />
</div>
