<script lang="ts">
  import LoginForm from '#lib/security/LoginForm.svelte';
  import ReadingProgress from '#lib/theme/ReadingProgress.svelte';
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

{#if data.kind === 'login'}
  <LoginForm
    sso={data.sso}
    captcha={data.captcha}
    membership={data.membership}
    back={data.back}
    signedOut={data.signedOut}
    privacyPolicy={data.privacy.policy}
    siteTitle={data.site.title}
    {form}
  />
{:else}
  <TemplateView {data} page={data} />
  {#if data.kind === 'content' && data.theme.settings.scrollToTop}
    <ReadingProgress />
  {/if}
{/if}
