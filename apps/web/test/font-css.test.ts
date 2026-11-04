import { expect, test } from 'bun:test';
import { fontFaceCss } from '#lib/theme/style';
import type { PublicFont } from '@cms/sdk';

test('font CSS cannot close a style element or inject declarations', () => {
  const payload = '</style><script>alert(1)</script>"}@import "https://evil";';
  const css = fontFaceCss([
    {
      family: payload,
      stylesheet: '',
      faces: [
        { src: payload, weight: payload, style: payload, display: payload },
      ],
    } as unknown as PublicFont,
  ]);

  expect(css).not.toContain('<');
  expect(css).not.toContain('@import');
  expect(css.match(/}/g)?.length ?? 0).toBeLessThanOrEqual(1);
});
