<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
</script>

<main class="mx-auto max-w-xl px-4 py-24 text-center">
  <p class="text-6xl font-bold">{page.status}</p>
  <p class="mt-4 text-muted-foreground">{page.error?.message}</p>
  <a href={resolve('/(site)')} class="mt-8 inline-block underline">Home</a>
</main>
