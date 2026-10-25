/** Inputs of the add-font form that can show a field issue. */
export const FONT_FIELDS = [
  'family',
  'fallback',
  'stylesheet',
  'src',
  'weight',
  'style',
  'display',
] as const;
export type FontField = (typeof FONT_FIELDS)[number];

/** The values the add-font form sent, kept so a refused attempt can be corrected. */
export type FontFormValues = Partial<Record<FontField | 'source', string>>;

interface Issue {
  path: string;
  message: string;
  params?: Record<string, string | number>;
}

/**
 * The add-font input an API issue belongs to. The API validates the whole font list
 * (`fonts.<n>.family`, `fonts.<n>.faces.<m>.src` …), so the last segment names the input; list-wide
 * issues (duplicates, a missing source, too many fonts) have none.
 */
export const fontIssueField = (path: string): FontField | null => {
  const segments = path.split('.');
  if (segments[0] !== 'fonts') return null;
  const last = segments.at(-1) ?? '';
  return (FONT_FIELDS as readonly string[]).includes(last)
    ? (last as FontField)
    : null;
};

/** Issues grouped by add-font input; the rest are shown above the form. */
export const fontIssues = (issues: readonly Issue[]) => {
  const fields: Partial<Record<FontField, Issue[]>> = {};
  const rest: Issue[] = [];
  for (const issue of issues) {
    const field = fontIssueField(issue.path);
    if (field) (fields[field] ??= []).push(issue);
    else rest.push(issue);
  }
  return { fields, rest };
};
