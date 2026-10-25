import { expect, test } from 'bun:test';
import { matchScore, searchNav } from '#lib/admin/nav-search.js';
import type { Searchable } from '#lib/admin/nav-search.js';

const entry = (
  href: string,
  [group, groupKo]: [string, string],
  [label, labelKo]: [string, string],
  keywords: string[] = [],
) => ({
  href,
  groups: [group, groupKo],
  labels: [label, labelKo],
  keywords,
});

const entries = [
  entry('/admin', ['Dashboard', '대시보드'], ['Dashboard', '대시보드']),
  entry('/admin/settings', ['Settings', '설정'], ['General', '일반']),
  entry(
    '/admin/settings/privacy',
    ['Settings', '설정'],
    ['Privacy', '개인정보 보호'],
  ),
  entry(
    '/admin/settings/permalinks',
    ['Settings', '설정'],
    ['Permalinks', '고유주소'],
    ['url', 'slug'],
  ),
  entry(
    '/admin/tools/health',
    ['Tools', '도구'],
    ['Site health', '사이트 상태'],
  ),
  entry(
    '/admin/tools/privacy/export',
    ['Tools', '도구'],
    ['Export Personal Data', '개인정보 내보내기'],
  ),
  entry('/admin/tools/webhooks', ['Tools', '도구'], ['Webhooks', '웹훅']),
  entry(
    '/admin/extensions/seo/redirects',
    ['Plugins', '플러그인'],
    ['Redirects', 'Redirects'],
    ['seo'],
  ),
];

const hrefs = (query: string) =>
  searchNav(entries, query).map((result) => result.href);

test('Korean and English labels find their screen', () => {
  expect(hrefs('고유')[0]).toBe('/admin/settings/permalinks');
  expect(hrefs('웹훅')).toEqual(['/admin/tools/webhooks']);
  expect(hrefs('permalink')).toEqual(['/admin/settings/permalinks']);
  expect(hrefs('redirects')).toEqual(['/admin/extensions/seo/redirects']);
});

test('matching ignores case and surrounding space', () => {
  expect(hrefs('  WEBHOOKS ')).toEqual(['/admin/tools/webhooks']);
  expect(hrefs('Site Health')).toEqual(['/admin/tools/health']);
});

test('the section name narrows the results, in either word order or written together', () => {
  expect(hrefs('설정 고유주소')).toEqual(['/admin/settings/permalinks']);
  expect(hrefs('고유주소 설정')).toEqual(['/admin/settings/permalinks']);
  expect(hrefs('설정고유')).toEqual(['/admin/settings/permalinks']);
  expect(hrefs('도구 개인정보')).toEqual(['/admin/tools/privacy/export']);
  expect(hrefs('tools export')).toEqual(['/admin/tools/privacy/export']);
});

test('a section name alone lists its screens, menu order kept for equal matches', () => {
  expect(hrefs('도구')).toEqual([
    '/admin/tools/health',
    '/admin/tools/privacy/export',
    '/admin/tools/webhooks',
  ]);
});

test('keywords find a screen; label matches rank above them', () => {
  expect(hrefs('slug')).toEqual(['/admin/settings/permalinks']);
  // "seo" is only a keyword of the plugin page; others match it only letter by letter.
  expect(hrefs('seo')[0]).toBe('/admin/extensions/seo/redirects');
});

test('whole and leading matches rank above matches inside a word', () => {
  // "Privacy" is a whole label; 개인정보 starts both Korean labels, so menu order decides.
  expect(hrefs('privacy')[0]).toBe('/admin/settings/privacy');
  expect(hrefs('개인정보')).toEqual([
    '/admin/settings/privacy',
    '/admin/tools/privacy/export',
  ]);
  const whole = matchScore(entries[6]!, 'webhooks')!;
  const start = matchScore(entries[6]!, 'web')!;
  const inside = matchScore(entries[6]!, 'hooks')!;
  expect(whole).toBeGreaterThan(start);
  expect(start).toBeGreaterThan(inside);
});

test('letters in order still match, below contiguous matches', () => {
  expect(hrefs('pmlk')).toEqual(['/admin/settings/permalinks']);
  expect(hrefs('whk')).toEqual(['/admin/tools/webhooks']);
});

test('Korean initial consonants match syllables', () => {
  expect(hrefs('ㄱㅇㅈㅅ')).toEqual(['/admin/settings/permalinks']);
  expect(hrefs('ㅇㅎ')[0]).toBe('/admin/tools/webhooks');
  // Mixed: a typed syllable then a lone consonant (mid-composition).
  expect(hrefs('고ㅇ')[0]).toBe('/admin/settings/permalinks');
  expect(hrefs('ㄷㄱ ㅇㅎ')).toEqual(['/admin/tools/webhooks']);
});

test('a word that matches nothing excludes the screen; an empty query lists everything', () => {
  expect(hrefs('zzz')).toEqual([]);
  expect(hrefs('설정 웹훅')).toEqual([]);
  expect(hrefs('')).toEqual(entries.map((item) => item.href));
  expect(hrefs('   ')).toEqual(entries.map((item) => item.href));
});

test('entries without keywords or with extra fields are accepted', () => {
  const plain: Searchable = { labels: ['Media'], groups: ['Media'] };
  expect(matchScore(plain, 'media')).toBeGreaterThan(0);
  expect(matchScore(plain, 'x')).toBeNull();
});
