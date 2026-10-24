import { z } from 'zod';

export const CODE_LANGUAGES = [
  'javascript',
  'typescript',
  'json',
  'html',
  'css',
  'python',
  'bash',
  'sql',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'ruby',
  'php',
  'yaml',
  'markdown',
  'svelte',
] as const;

export const CODE_THEMES = [
  'dark-plus',
  'dracula-soft',
  'dracula',
  'github-dark-dimmed',
  'github-dark',
  'github-light',
  'light-plus',
  'material-darker',
  'material-default',
  'material-lighter',
  'material-ocean',
  'material-palenight',
  'min-dark',
  'min-light',
  'monokai',
  'nord',
  'one-dark-pro',
  'poimandres',
  'rose-pine-dawn',
  'rose-pine-moon',
  'rose-pine',
  'slack-dark',
  'slack-ochin',
  'solarized-dark',
  'solarized-light',
  'vitesse-dark',
  'vitesse-light',
] as const;

/** Ranges refer to one-based code rows, independently of the displayed start number. */
export const highlightLinesSchema = z
  .string()
  .max(2000)
  .refine((value) => {
    if (value === '') return true;
    if (!/^[1-9]\d*(?:-[1-9]\d*)?(?:,[1-9]\d*(?:-[1-9]\d*)?)*$/.test(value))
      return false;
    return value.split(',').every((range) => {
      const [start = 0, end = start] = range.split('-').map(Number);
      return (
        Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start
      );
    });
  });

export const codeBlockAttributesSchema = z.strictObject({
  // Historical documents can contain arbitrary language labels. Renderers must
  // resolve these against their grammar registry, never as HTML or module paths.
  language: z
    .union([z.string().max(65535), z.number(), z.boolean()])
    .nullable()
    .default(null),
  theme: z.enum(CODE_THEMES).nullable().default(null),
  label: z.string().max(2000).default(''),
  lineNumbers: z.boolean().default(false),
  startLine: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  highlightLines: highlightLinesSchema.default(''),
  copyButton: z.boolean().default(true),
});

export type CodeBlockAttributes = z.infer<typeof codeBlockAttributesSchema>;

/** Shiki's bundled theme id for a code block theme name (Shiki names Material `material-theme*`). */
export const shikiThemeId = (theme: string): string =>
  theme === 'material-default'
    ? 'material-theme'
    : theme.startsWith('material-')
      ? theme.replace('material-', 'material-theme-')
      : theme;

/** Whether a one-based code row falls in a valid `highlightLines` value. */
export const highlightedRows = (highlightLines: string) => {
  const ranges = highlightLines
    .split(',')
    .filter(Boolean)
    .map((range) => {
      const [start = 0, end = start] = range.split('-').map(Number);
      return [start, end] as const;
    });
  return (row: number) =>
    ranges.some(([start, end]) => row >= start && row <= end);
};

export const codeLanguage = (
  value: unknown,
): (typeof CODE_LANGUAGES)[number] | 'text' => {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    py: 'python',
    rb: 'ruby',
    md: 'markdown',
    cs: 'csharp',
    'c#': 'csharp',
    'c++': 'cpp',
  };
  const id =
    typeof value === 'string'
      ? (aliases[value.toLowerCase()] ?? value.toLowerCase())
      : '';
  return CODE_LANGUAGES.find((language) => language === id) ?? 'text';
};
