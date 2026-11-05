<script lang="ts">
  import { LINK_RELS, linkRels } from '@cms/content/link';
  import type { LinkRel, LinkSettings } from '@cms/content/link';
  import { useI18n } from '#lib/i18n/index.js';

  interface Props {
    newTab: boolean;
    /** The chosen `rel` tokens; omit where the link's renderer offers no `rel` choices. */
    rel?: LinkRel[];
    class?: string;
    /** Told every change, with the `rel` tokens in stored order. */
    onchange?: (settings: LinkSettings) => void;
  }

  let {
    newTab = $bindable(),
    rel = $bindable(),
    class: className = '',
    onchange,
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const changed = () => onchange?.({ newTab, rel: rel ?? [] });

  const toggle = (token: LinkRel, checked: boolean) => {
    rel = linkRels(
      checked
        ? [...(rel ?? []), token]
        : (rel ?? []).filter((item) => item !== token),
    );
    changed();
  };
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1 {className}">
  <label class="flex items-center gap-2"
    ><input
      type="checkbox"
      checked={newTab}
      onchange={(event) => {
        newTab = event.currentTarget.checked;
        changed();
      }}
    />{m.contentNewTab}</label
  >
  {#if rel}
    <div
      role="group"
      aria-label={m.linkRel}
      class="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {#each LINK_RELS as token (token)}
        <label class="flex items-center gap-2"
          ><input
            type="checkbox"
            checked={rel.includes(token)}
            onchange={(event) => toggle(token, event.currentTarget.checked)}
          />{m.linkRelName(token)}</label
        >
      {/each}
    </div>
  {/if}
</div>
