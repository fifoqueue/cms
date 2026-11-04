import { expect, test } from 'bun:test';
import { Embeds } from '#api/domain/content/embeds';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import { recordingLogger } from '#test/support/memory';

test('embed HTML changes preserve allowed players and reject identity changes and XSS', async () => {
  const hooks = new HookBus({
    timeoutMs: 100,
    logger: recordingLogger().logger,
  });
  const registrar = hooks.registrar('functions:site', { trusted: true });
  const player = '<iframe src="https://player.example/video"></iframe>';
  const embeds = new Embeds(
    () => [{ name: 'sample', render: () => player }],
    undefined,
    hooks,
  );

  registrar.filter('embed.html', (value) => ({
    ...value,
    html: `<p>Changed</p>${player}<script>alert(1)</script><iframe src="https://attacker.example/" srcdoc="<script>alert(2)</script>"></iframe><img src="javascript:alert(3)" onerror="alert(4)">`,
  }));
  registrar.filter('embed.html', (value) => ({
    ...value,
    url: 'https://forged.example/',
    provider: 'forged',
    html: '<p>Wrong</p>',
  }));
  const output = await embeds.expand(
    '<figure data-embed-url="https://example.com/video" class="embed"><a href="https://example.com/video">video</a></figure>',
  );

  expect(output).toContain('Changed');
  expect(output).toContain('<iframe src="https://player.example/video"');
  expect(output).not.toMatch(
    /<script|srcdoc|onerror|javascript:|attacker|Wrong/,
  );
});
