import { expect, test } from 'bun:test';
import { translationManifest } from '@cms/sdk/i18n-manifest';

test('catalog generation retains scoped keys and function parameters', () => {
  expect(translationManifest.site.commentCount).toEqual(['count']);
  expect(translationManifest.site.themePaged).toEqual(['title', 'page']);
  expect(translationManifest.admin.commentCount).toEqual(['count']);
  expect(translationManifest.email['reset.text']).toContain('link');
  expect(translationManifest.email['commentReply.text']).toContain(
    'unsubscribe',
  );
});
