<script lang="ts">
  import { statusLine } from '#lib/admin/form-errors.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const titles = $derived({
    siteUrl: m.healthSiteUrl,
    email: m.healthEmail,
    search: m.healthSearch,
    scheduler: m.healthScheduler,
    jobs: m.healthJobs,
    plugins: m.healthPlugins,
    visitorProof: m.healthVisitorProof,
  });
  const fixes = $derived({
    siteUrl: m.healthSiteUrlFix,
    email: m.healthEmailFix,
    search: m.healthSearchFix,
    scheduler: m.healthSchedulerFix,
    jobs: m.healthJobsFix,
    plugins: m.healthPluginsFix,
    visitorProof: m.healthVisitorProofFix,
  });
  type Key = (typeof data.checks)[number]['key'];
  /** Plugin checks (`plugin:<id>:<key>`) have no translation; their key is the title. */
  const titleOf = (key: Key) =>
    Object.hasOwn(titles, key) ? titles[key as keyof typeof titles] : key;
  const fixOf = (key: Key) =>
    Object.hasOwn(fixes, key) ? fixes[key as keyof typeof fixes] : '';
  const order = { critical: 0, recommended: 1, good: 2 } as const;
  const checks = $derived(
    [...data.checks].sort((a, b) => order[a.status] - order[b.status]),
  );
  const statusNames = $derived({
    critical: m.healthCritical,
    recommended: m.healthRecommended,
    good: m.healthGood,
  });
</script>

<svelte:head><title>{m.toolsHealth}</title></svelte:head>

<Card>
  <CardHeader><CardTitle>{m.toolsHealth}</CardTitle></CardHeader>
  <CardContent>
    <ul class="divide-y">
      {#each checks as check (check.key)}
        <li class="grid gap-1 py-3">
          <p class="flex flex-wrap items-center gap-2 font-medium">
            <Badge
              variant={check.status === 'critical'
                ? 'destructive'
                : check.status === 'recommended'
                  ? 'secondary'
                  : 'outline'}>{statusNames[check.status]}</Badge
            >
            {titleOf(check.key)}
          </p>
          {#if check.status !== 'good' && fixOf(check.key)}
            <p class="text-sm text-muted-foreground">{fixOf(check.key)}</p>
          {/if}
          {#if check.detail.length}
            <ul class="text-sm text-muted-foreground">
              {#each check.detail as line, index (index)}
                <li><code class="break-all">{statusLine(m, line)}</code></li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </CardContent>
</Card>

<Card>
  <CardHeader><CardTitle>{m.healthInfo}</CardTitle></CardHeader>
  <CardContent>
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-muted-foreground">CMS</dt>
      <dd>{data.info.cms}</dd>
      <dt class="text-muted-foreground">{m.healthRuntime}</dt>
      <dd>{data.info.runtime}</dd>
      <dt class="text-muted-foreground">{m.healthDatabase}</dt>
      <dd>{data.info.database}</dd>
    </dl>
  </CardContent>
</Card>
