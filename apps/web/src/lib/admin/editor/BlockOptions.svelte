<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import type { AdminMedia, MediaKind } from '@cms/sdk';
  import { Popover } from 'bits-ui';
  import { tick } from 'svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import {
    blockTargets,
    mediaNode,
    resizeColumns,
  } from '#lib/admin/editor/blocks.js';

  let { editor, revision }: { editor: Editor; revision: number } = $props();
  const i18n = useI18n();
  const m = $derived(i18n.m);
  const targets = $derived(revision >= 0 ? blockTargets(editor) : []);
  type Target = ReturnType<typeof blockTargets>[number];
  let picker: ReturnType<typeof MediaPicker>;
  let mediaKind = $state<MediaKind>('image');
  let mediaTarget = $state<{ pos: number; type: string } | null>(null);
  const text = (target: Target, key: string) =>
    typeof target.node.attrs[key] === 'string'
      ? (target.node.attrs[key] as string)
      : '';

  const update = (target: Target, attrs: Record<string, unknown>) => {
    const node = editor.state.doc.nodeAt(target.pos);
    if (node?.type !== target.node.type) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(target.pos, undefined, {
        ...node.attrs,
        ...attrs,
      }),
    );
  };

  const chooseMedia = async (target: Target) => {
    const type = target.node.type.name;
    mediaKind =
      type === 'file' ? 'document' : type === 'video' ? 'video' : 'image';
    mediaTarget = { pos: target.pos, type };
    await tick();
    picker.open();
  };

  const picked = (media: AdminMedia) => {
    if (!mediaTarget || media.kind !== mediaKind) return;
    const node = editor.state.doc.nodeAt(mediaTarget.pos);
    if (node?.type.name !== mediaTarget.type) return;
    const item = mediaNode(media);
    if (mediaTarget.type === 'gallery') {
      if (node.childCount < 100)
        editor.commands.insertContentAt(
          mediaTarget.pos + node.nodeSize - 1,
          item,
        );
    } else
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(mediaTarget.pos, undefined, {
          ...node.attrs,
          ...item.attrs,
        }),
      );
    mediaTarget = null;
  };
</script>

{#each targets as target (target.pos)}
  {@const type = target.node.type.name}
  <Popover.Root>
    <Popover.Trigger
      type="button"
      class="rounded-md px-2 py-1 text-xs hover:bg-muted"
      aria-label={m.contentBlockSettings(m.contentBlockName(type))}
    >
      {m.contentBlockName(type)}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        sideOffset={8}
        align="start"
        class="z-50 grid max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-md"
      >
        <p class="font-medium">
          {m.contentBlockSettings(m.contentBlockName(type))}
        </p>
        {#if type === 'video' || type === 'file' || type === 'gallery'}
          <Popover.Close
            type="button"
            class="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            disabled={type === 'gallery' && target.node.childCount >= 100}
            onclick={() => chooseMedia(target)}
            >{type === 'gallery'
              ? m.contentAddImage
              : m.mediaChoose}</Popover.Close
          >
        {/if}
        {#if ['video', 'gallery', 'table'].includes(type)}
          <label class="grid gap-1"
            >{m.contentCaption}<Input
              value={text(target, 'caption')}
              maxlength={2000}
              oninput={(event) =>
                update(target, { caption: event.currentTarget.value })}
            /></label
          >
        {/if}
        {#if type === 'gallery'}
          <label class="grid gap-1"
            >{m.contentAlignment}<NativeSelect
              value={text(target, 'align')}
              onchange={(event) =>
                update(target, { align: event.currentTarget.value })}
            >
              {#each ['left', 'center', 'right', 'wide', 'full'] as align (align)}<NativeSelectOption
                  value={align}
                  >{m.contentAlignmentName(align)}</NativeSelectOption
                >{/each}
            </NativeSelect></label
          >
        {/if}
        {#if type === 'button'}
          <label class="grid gap-1"
            >{m.contentLink}<Input
              value={text(target, 'href')}
              maxlength={2048}
              placeholder="https://"
              oninput={(event) =>
                update(target, { href: event.currentTarget.value || null })}
            /></label
          >
          <label class="flex items-center gap-2"
            ><input
              type="checkbox"
              checked={target.node.attrs.newTab === true}
              onchange={(event) =>
                update(target, { newTab: event.currentTarget.checked })}
            />{m.contentNewTab}</label
          >
        {/if}
        {#if type === 'gallery'}
          <label class="grid gap-1"
            >{m.contentColumnCount}<Input
              type="number"
              min={1}
              max={6}
              value={Number(target.node.attrs.columns)}
              onchange={(event) => {
                const columns = Number(event.currentTarget.value);
                if (columns >= 1 && columns <= 6 && Number.isInteger(columns))
                  update(target, { columns });
              }}
            /></label
          >
          <label class="flex items-center gap-2"
            ><input
              type="checkbox"
              checked={target.node.attrs.crop === true}
              onchange={(event) =>
                update(target, { crop: event.currentTarget.checked })}
            />{m.contentCropImages}</label
          >
        {/if}
        {#if type === 'columns'}
          <label class="grid gap-1"
            >{m.contentColumnCount}<NativeSelect
              value={String(target.node.childCount)}
              onchange={(event) =>
                resizeColumns(
                  editor,
                  target.pos,
                  Number(event.currentTarget.value),
                )}
            >
              {#each [2, 3, 4] as count (count)}<NativeSelectOption
                  value={String(count)}>{count}</NativeSelectOption
                >{/each}
            </NativeSelect></label
          >
          <label class="flex items-center gap-2"
            ><input
              type="checkbox"
              checked={target.node.attrs.stack === true}
              onchange={(event) =>
                update(target, { stack: event.currentTarget.checked })}
            />{m.contentStackMobile}</label
          >
        {/if}
        {#if type === 'paragraph' || type === 'heading' || type === 'buttons'}
          <label class="grid gap-1"
            >{m.contentAlignment}<NativeSelect
              value={text(target, type === 'buttons' ? 'align' : 'textAlign') ||
                'left'}
              onchange={(event) =>
                update(target, {
                  [type === 'buttons' ? 'align' : 'textAlign']:
                    event.currentTarget.value,
                })}
            >
              {#each type === 'buttons' ? ['left', 'center', 'right'] : ['left', 'center', 'right', 'justify'] as align (align)}<NativeSelectOption
                  value={align}
                  >{m.contentAlignmentName(align)}</NativeSelectOption
                >{/each}
            </NativeSelect></label
          >
        {/if}
        {#if type === 'heading'}
          <label class="grid gap-1"
            >{m.contentHeadingLevel}<NativeSelect
              value={String(target.node.attrs.level)}
              onchange={(event) =>
                update(target, { level: Number(event.currentTarget.value) })}
            >
              {#each [2, 3, 4] as level (level)}<NativeSelectOption
                  value={String(level)}>H{level}</NativeSelectOption
                >{/each}
            </NativeSelect></label
          >
        {/if}
        {#if type === 'button'}
          <label class="grid gap-1"
            >{m.contentButtonStyle}<NativeSelect
              value={text(target, 'variant')}
              onchange={(event) =>
                update(target, { variant: event.currentTarget.value })}
            >
              <NativeSelectOption value="fill"
                >{m.contentButtonFill}</NativeSelectOption
              ><NativeSelectOption value="outline"
                >{m.contentButtonOutline}</NativeSelectOption
              >
            </NativeSelect></label
          >
        {/if}
        {#if type === 'buttons'}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={target.node.childCount >= 20}
            onclick={() =>
              editor.commands.insertContentAt(
                target.pos + target.node.nodeSize - 1,
                {
                  type: 'button',
                  content: [{ type: 'text', text: m.contentButtonLabel }],
                },
              )}>{m.contentAddButton}</Button
          >
        {/if}
        {#if type === 'details'}<label class="flex items-center gap-2"
            ><input
              type="checkbox"
              checked={target.node.attrs.open === true}
              onchange={(event) =>
                update(target, { open: event.currentTarget.checked })}
            />{m.contentDetailsOpen}</label
          >{/if}
        {#if type === 'pullquote'}<label class="grid gap-1"
            >{m.contentCitation}<Input
              value={text(target, 'cite')}
              maxlength={2000}
              oninput={(event) =>
                update(target, { cite: event.currentTarget.value })}
            /></label
          >{/if}
        {#if type === 'spacer'}<label class="grid gap-1"
            >{m.contentSpacerHeight}<Input
              type="number"
              min={0}
              max={500}
              value={Number(target.node.attrs.height)}
              onchange={(event) => {
                const height = Number(event.currentTarget.value);
                if (Number.isInteger(height) && height >= 0 && height <= 500)
                  update(target, { height });
              }}
            /></label
          >{/if}
        {#if type === 'table'}<Button
            type="button"
            variant="outline"
            size="sm"
            onclick={() => editor.chain().focus().toggleHeaderRow().run()}
            >{m.contentHeaderRow}</Button
          >{/if}
        {#if type === 'embed'}<label class="grid gap-1"
            >{m.embedUrl}<Input
              type="url"
              value={text(target, 'url')}
              maxlength={2048}
              oninput={(event) =>
                update(target, { url: event.currentTarget.value || null })}
            /></label
          >{/if}
        {#if type === 'file'}
          <label class="grid gap-1"
            >{m.contentFileLabel}<Input
              value={text(target, 'name')}
              maxlength={2000}
              oninput={(event) =>
                update(target, { name: event.currentTarget.value })}
            /></label
          >
          <label class="flex items-center gap-2"
            ><input
              type="checkbox"
              checked={target.node.attrs.download === true}
              onchange={(event) =>
                update(target, { download: event.currentTarget.checked })}
            />{m.contentDownload}</label
          >
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{/each}
<MediaPicker bind:this={picker} kind={mediaKind} onpick={picked} />
