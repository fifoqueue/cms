<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import LoginForm from '#lib/security/LoginForm.svelte';
  import ReadingProgress from '#lib/theme/ReadingProgress.svelte';
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
      site: { title: string };
    },
  );
</script>

{#if login.kind === 'login'}
  <LoginForm
    signIn={login.signIn}
    captcha={login.captcha}
    membership={login.membership}
    back={login.back}
    signedOut={login.signedOut}
    privacyPolicy={layout.privacy.policy}
    siteTitle={layout.site.title}
    {form}
  />
{:else}
  <TemplateView data={view} page={view} />
  {#if view.kind === 'content' && view.theme.settings.scrollToTop}
    <ReadingProgress />
  {/if}
{/if}
