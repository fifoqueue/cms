<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import LoginForm from '#lib/security/LoginForm.svelte';
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import type { ThemePage } from '#lib/theme/template.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // The load is re-exported from `[...path]`, so SvelteKit cannot infer its data type here.
  const view = $derived(
    data as unknown as ComponentProps<typeof TemplateView>['data'] & ThemePage,
  );
  const login = $derived(
    data as unknown as ComponentProps<typeof LoginForm> & { kind?: string },
  );
  const layout = $derived(
    data as unknown as {
      privacy: { policy: ComponentProps<typeof LoginForm>['privacyPolicy'] };
    },
  );
</script>

{#if login.kind === 'login'}
  <main id="main" class="mx-auto w-full max-w-md px-4 py-12">
    <LoginForm
      sso={login.sso}
      captcha={login.captcha}
      membership={login.membership}
      back={login.back}
      signedOut={login.signedOut}
      privacyPolicy={layout.privacy.policy}
      {form}
    />
  </main>
{:else}
  <TemplateView data={view} page={view} />
{/if}
