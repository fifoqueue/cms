<script lang="ts">
  import LoginForm from '#lib/security/LoginForm.svelte';
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

{#if data.kind === 'login'}
  <main id="main" class="mx-auto w-full max-w-md px-4 py-12">
    <LoginForm
      sso={data.sso}
      captcha={data.captcha}
      membership={data.membership}
      back={data.back}
      signedOut={data.signedOut}
      privacyPolicy={data.privacy.policy}
      {form}
    />
  </main>
{:else}
  <TemplateView {data} page={data} />
{/if}
