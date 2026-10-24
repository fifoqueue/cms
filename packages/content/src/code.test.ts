import { expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { EnhancedCodeBlock } from '#content/code';
import { renderCodeBlock } from '#content/code-render';
import { Window } from 'happy-dom';
import { generateJSON } from '@tiptap/html/server';
import { codeLanguage, codeBlockAttributesSchema } from '@cms/sdk/code-block';

test('whitespace survives document and highlighted HTML round trips', () => {
  const schema = getSchema([
    StarterKit.configure({ codeBlock: false }),
    EnhancedCodeBlock,
  ]);
  const code = '\tconst x = 1;\n  \n';
  const node = schema.nodeFromJSON({
    type: 'codeBlock',
    attrs: { language: 'javascript' },
    content: [{ type: 'text', text: code }],
  });
  expect(schema.nodeFromJSON(node.toJSON()).textContent).toBe(code);
  const window = new Window();
  window.document.body.innerHTML = renderCodeBlock(code, {
    language: 'javascript',
    label: 'Example',
    lineNumbers: true,
  });
  expect(window.document.querySelector('code')?.textContent).toBe(code);
});
test('malicious text and labels are escaped', () => {
  const html = renderCodeBlock('<script>alert(1)</script>', {
    label: '<img onerror=x>',
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
});
test('unknown language and theme use plain code', () => {
  for (const attrs of [
    { language: 'unknown' },
    { language: 'javascript', theme: 'unknown' },
  ])
    expect(renderCodeBlock('const x = 1', attrs)).toContain('const x = 1');
});
test('old documents remain renderable and ranges decorate rows', () => {
  expect(renderCodeBlock('hello', {})).toContain('hello');
  expect(
    renderCodeBlock('a\nb', {
      highlightLines: '2',
      startLine: 8,
      lineNumbers: true,
    }),
  ).toContain('data-line="9"');
});

test('legacy scalar languages, aliases and escaped class names survive', () => {
  for (const language of [1, true, null, 'custom'])
    expect(codeBlockAttributesSchema.safeParse({ language }).success).toBe(
      true,
    );
  for (const [alias, id] of [
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['py', 'python'],
    ['sh', 'bash'],
    ['yml', 'yaml'],
  ])
    expect(String(codeLanguage(alias))).toBe(String(id));
  expect(renderCodeBlock('x', { language: 'a"b' })).toContain(
    'class="language-a&quot;b"',
  );
});

test('pasted invalid attributes fall back without corrupting code', () => {
  const document = generateJSON(
    '<pre data-code-startline="NaN" data-code-theme="bad" data-code-highlightlines="4-1"><code>\t a\n</code></pre>',
    [StarterKit.configure({ codeBlock: false }), EnhancedCodeBlock],
  );
  const node = document.content![0]!;
  expect(codeBlockAttributesSchema.safeParse(node.attrs).success).toBe(true);
  expect(node.attrs!.startLine).toBe(1);
  expect(node.content![0]!.text).toBe('\t a\n');
});

test('auto themes, fixed themes, accessible numbers and large plain fallback', () => {
  expect(renderCodeBlock('const x = 1', { language: 'js' })).toContain(
    '--shiki-dark',
  );
  expect(
    renderCodeBlock('const x = 1', { language: 'js', theme: 'github-light' }),
  ).not.toContain('cms-code-auto');
  const html = renderCodeBlock('x'.repeat(100_001), {
    language: 'js',
    lineNumbers: true,
  });
  expect(html).not.toContain('<span style=');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('tabindex="0"');
});
