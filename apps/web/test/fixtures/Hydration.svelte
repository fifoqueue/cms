<script lang="ts">
  let {
    items,
    headHtml,
    html,
    note,
  }: { items: string[]; headHtml: string; html: string; note: string } =
    $props();
</script>

<svelte:head>
  <title>{note}</title>
  {#each items as item (item)}<meta name="keywords" content={item} />{/each}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- test fixture -->
  {@html headHtml}
</svelte:head>

<main class="a b">
  <h1>{note}</h1>
  {#if items.length}
    <ul>
      {#each items as item (item)}
        <li>{item} <b>!</b></li>
      {/each}
    </ul>
  {/if}
  <pre>  indented
    code  </pre>
  <textarea name="t">  raw
 text </textarea>
  <p style="white-space: pre-wrap">spaced out</p>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- test fixture -->
  {@html html}
  <input disabled value="" />
</main>
