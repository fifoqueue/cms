import { expect, test } from 'bun:test';
import { filterHtml } from '#api/domain/content/html-filter';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

const content = {
  id: 'entry',
  type: 'post',
  slug: 'entry',
  path: '/entry',
  title: 'Entry',
};

for (const context of ['single', 'feed', 'preview'] as const) {
  test(`HTML ${context} filters keep core HTML policy and fixed identity`, async () => {
    const hooks = new HookBus({
      timeoutMs: 100,
      logger: recordingLogger().logger,
    });
    const registrar = hooks.registrar('functions:site', { trusted: true });
    registrar.filter('content.html', (value) => {
      expect(value.context).toBe(context);
      return {
        ...value,
        html: '<p>Changed <strong>body</strong></p><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">',
      };
    });
    registrar.filter('content.html', (value) => ({
      ...value,
      content: { ...value.content, id: 'forged' },
      html: '<p>Wrong</p>',
    }));
    const html = await filterHtml(hooks, '<p>Body</p>', content, context);
    expect(html).toContain('<strong>body</strong>');
    expect(html).not.toMatch(/<script|onerror|javascript:|Wrong/);
  });
}

test('HTML without handlers preserves rendered core markup byte for byte', async () => {
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const html = '<nav class="cms-toc"><a href="#a">A</a></nav><h2 id="a">A</h2>';
  expect(await filterHtml(hooks, html, content, 'single')).toBe(html);
});
