// Shared by the SEO editor, the SEO settings screen and their server-side form readers.
import type {
  AdminEntrySeo,
  AdminSeoSettings,
  PermalinkSettings,
} from '@cms/sdk';

/** Name of the hidden marker the SEO fieldset submits. Without it, saves leave SEO untouched. */
export const SEO_FIELDSET = 'seo';

/** Form field name of one entry SEO value. */
export const seoField = (key: keyof AdminEntrySeo) => `seo.${key}`;

export const SCHEMA_TYPES = [
  'auto',
  'Article',
  'BlogPosting',
  'WebPage',
] as const satisfies readonly AdminEntrySeo['schemaType'][];

/** What the SEO fieldset submitted, echoed back after a failed save. Only these keys. */
export type SeoFormValues = Omit<AdminEntrySeo, 'schemaType'> & {
  schemaType: string;
};

export const seoFormValues = (seo: AdminEntrySeo): SeoFormValues => ({
  title: seo.title,
  description: seo.description,
  canonicalUrl: seo.canonicalUrl,
  noIndex: seo.noIndex,
  noFollow: seo.noFollow,
  imageUrl: seo.imageUrl,
  imageAlt: seo.imageAlt,
  socialTitle: seo.socialTitle,
  socialDescription: seo.socialDescription,
  schemaType: seo.schemaType,
  authorName: seo.authorName,
  authorUrl: seo.authorUrl,
  focusKeyword: seo.focusKeyword,
});

/** Saved settings an editor preview needs to match what the public site renders. */
export interface SeoPreviewContext {
  timeZone?: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  titleTemplate: string;
  defaultImageUrl: string;
  defaultImageAlt: string;
  indexingEnabled: boolean;
  indexCategories: boolean;
  indexTags: boolean;
  permalinks: PermalinkSettings;
}

/** The SEO settings form as typed: numbers and the `sameAs` list stay raw text. */
export type SeoSettingsFormValues = Omit<
  AdminSeoSettings,
  'sameAs' | 'maxSnippet' | 'maxVideoPreview' | 'entityType' | 'maxImagePreview'
> & {
  sameAs: string;
  maxSnippet: string;
  maxVideoPreview: string;
  entityType: string;
  maxImagePreview: string;
};

export const seoSettingsFormValues = (
  settings: AdminSeoSettings,
): SeoSettingsFormValues => ({
  siteUrl: settings.siteUrl,
  titleTemplate: settings.titleTemplate,
  homeTitle: settings.homeTitle,
  homeDescription: settings.homeDescription,
  defaultImageUrl: settings.defaultImageUrl,
  defaultImageAlt: settings.defaultImageAlt,
  entityType: settings.entityType,
  entityName: settings.entityName,
  logoUrl: settings.logoUrl,
  sameAs: settings.sameAs.join('\n'),
  twitterHandle: settings.twitterHandle,
  indexingEnabled: settings.indexingEnabled,
  indexCategories: settings.indexCategories,
  indexTags: settings.indexTags,
  allowAiSearch: settings.allowAiSearch,
  allowAiTraining: settings.allowAiTraining,
  llmsTxtEnabled: settings.llmsTxtEnabled,
  llmsIntro: settings.llmsIntro,
  googleVerification: settings.googleVerification,
  bingVerification: settings.bingVerification,
  maxSnippet: String(settings.maxSnippet),
  maxImagePreview: settings.maxImagePreview,
  maxVideoPreview: String(settings.maxVideoPreview),
});

/** Visible characters, so emoji and combined letters count once. */
export const charCount = (value: string) =>
  [...new Intl.Segmenter().segment(value)].length;

export type LengthState = 'empty' | 'short' | 'good' | 'long';

/** Common display-length recommendations; search engines truncate by pixel width, not a rule. */
export const LENGTH_GUIDE = {
  title: { min: 30, max: 60 },
  description: { min: 120, max: 160 },
} as const;

export const lengthState = (
  value: string,
  { min, max }: { min: number; max: number },
): LengthState => {
  const count = charCount(value);
  if (!count) return 'empty';
  if (count < min) return 'short';
  return count > max ? 'long' : 'good';
};

interface DocNode {
  type?: unknown;
  text?: unknown;
  content?: unknown;
}

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
]);

/** Plain text of an editor document, one line per block. */
export const documentText = (document: unknown) => {
  const lines: string[] = [];
  let line = '';
  let headings = 0;
  const walk = (node: DocNode) => {
    if (typeof node.text === 'string') line += node.text;
    if (node.type === 'heading') headings++;
    if (Array.isArray(node.content))
      for (const child of node.content as DocNode[]) walk(child);
    if (typeof node.type === 'string' && BLOCKS.has(node.type) && line) {
      lines.push(line);
      line = '';
    }
  };
  if (document && typeof document === 'object') walk(document as DocNode);
  if (line) lines.push(line);
  return { text: lines.join('\n'), headings };
};

const words = (value: string) =>
  [
    ...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value),
  ].filter((segment) => segment.isWordLike).length;

/** Plain facts about the body text; no score. */
export const readingStats = (text: string) => {
  const wordCount = words(text);
  const sentences = [
    ...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text),
  ].filter(({ segment }) => segment.trim()).length;
  return {
    words: wordCount,
    minutes: wordCount ? Math.max(1, Math.round(wordCount / 200)) : 0,
    wordsPerSentence: sentences ? Math.round(wordCount / sentences) : 0,
  };
};

const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

/** How often `keyword` occurs in `text`, ignoring case. */
export const occurrences = (text: string, keyword: string) => {
  const needle = fold(keyword.trim());
  if (!needle) return 0;
  return fold(text).split(needle).length - 1;
};

/** The keyword as slug words, e.g. "Sourdough Bread" -> "sourdough-bread". */
export const keywordSlug = (keyword: string) =>
  fold(keyword)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Joins the configured origin and a site path; just the path while no origin is set. */
export const absoluteUrl = (siteUrl: string, path: string) =>
  siteUrl ? `${siteUrl}${path}` : path;
