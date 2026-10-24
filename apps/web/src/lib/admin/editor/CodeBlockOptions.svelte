<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import type { Node } from '@tiptap/pm/model';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    CODE_LANGUAGES,
    CODE_THEMES,
    codeBlockAttributesSchema,
  } from '@cms/sdk/code-block';
  let {
    editor,
    target,
    labels,
  }: {
    editor: Editor;
    target: { node: Node; pos: number };
    labels: Record<string, string>;
  } = $props();
  let invalid = $state<Record<string, boolean>>({});
  const update = (key: string, value: unknown) => {
    if (key === 'highlightLines' && typeof value === 'string')
      value = value.replace(/\s/g, '');
    if (key === 'startLine' && value === '') value = 1;
    const node = editor.state.doc.nodeAt(target.pos);
    if (node?.type.name !== 'codeBlock') return;
    const attrs = { ...node.attrs, [key]: value };
    invalid[key] = !codeBlockAttributesSchema.safeParse(attrs).success;
    if (invalid[key]) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(target.pos, undefined, attrs),
    );
  };
</script>

{#each ['language', 'theme'] as key (key)}
  <label class="grid gap-1">
    {labels[key]}
    <Input
      aria-invalid={invalid[key] || undefined}
      placeholder={key === 'theme' ? labels.auto : ''}
      list={`code-${key}-${target.pos}`}
      value={target.node.attrs[key] ?? ''}
      onchange={(event) => update(key, event.currentTarget.value || null)}
    />
    <datalist id={`code-${key}-${target.pos}`}>
      {#each key === 'language' ? CODE_LANGUAGES : CODE_THEMES as value (value)}
        <option {value}></option>
      {/each}
    </datalist>
    {#if invalid[key]}<span role="alert">{labels.invalid}</span>{/if}
  </label>
{/each}
{#each ['label', 'highlightLines'] as key (key)}
  <label class="grid gap-1"
    >{labels[key]}
    <Input
      aria-invalid={invalid[key] || undefined}
      value={target.node.attrs[key] ?? ''}
      onchange={(event) => update(key, event.currentTarget.value)}
    />
    {#if invalid[key]}<span role="alert">{labels.invalid}</span>{/if}
  </label>
{/each}
{#each ['lineNumbers', 'copyButton'] as key (key)}
  <label
    ><input
      type="checkbox"
      checked={target.node.attrs[key]}
      onchange={(event) => update(key, event.currentTarget.checked)}
    />
    {labels[key]}</label
  >
{/each}
<label class="grid gap-1"
  >{labels.startLine}
  <Input
    aria-invalid={invalid.startLine || undefined}
    type="number"
    min="1"
    step="1"
    value={target.node.attrs.startLine ?? 1}
    onchange={(event) =>
      update(
        'startLine',
        event.currentTarget.value === ''
          ? ''
          : event.currentTarget.valueAsNumber,
      )}
  />
  {#if invalid.startLine}<span role="alert">{labels.invalid}</span>{/if}
</label>
