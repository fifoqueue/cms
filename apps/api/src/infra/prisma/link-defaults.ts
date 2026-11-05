import { InvalidDocumentError } from '@cms/content';
import { renderDocument } from '@cms/content/render';
import type { ContentDocument } from '@cms/sdk';
import type { Database } from '#api/infra/prisma/client';
import { Prisma } from '#api/infra/prisma/generated/client';

/** What earlier editor versions stored on every link mark, chosen or not. */
const INJECTED = { target: '_blank', rel: 'noopener noreferrer nofollow' };

const PATTERN_PREFIX = 'pattern.';

interface StoredNode {
  [key: string]: unknown;
  marks?: { type?: unknown; attrs?: Record<string, unknown> }[];
  content?: StoredNode[];
}

/**
 * `document` with every link mark whose `target`/`rel` exactly equal the injected defaults
 * turned into a plain link, or null when there is none. The input is not modified.
 */
export const withoutLinkDefaults = (
  document: ContentDocument,
): ContentDocument | null => {
  let changed = false;
  const visit = (node: StoredNode): StoredNode => {
    const marks = node.marks?.map((mark) => {
      if (
        mark.type !== 'link' ||
        mark.attrs?.target !== INJECTED.target ||
        mark.attrs?.rel !== INJECTED.rel
      )
        return mark;
      changed = true;

      return { ...mark, attrs: { ...mark.attrs, target: null, rel: null } };
    });

    return {
      ...node,
      ...(marks && { marks }),
      ...(node.content && { content: node.content.map(visit) }),
    };
  };
  const result = visit(document as StoredNode);

  return changed ? (result as ContentDocument) : null;
};

export interface LinkDefaultsReport {
  /** Rows whose document or stored HTML was (or, in a dry run, would be) rewritten. */
  contents: number;
  revisions: number;
  patterns: number;
  /** Rows skipped because they could not be read or rendered, or changed while migrating. */
  skipped: string[];
}

interface Options {
  dryRun: boolean;
  batch: number;
}

const parsed = (text: string): ContentDocument | null => {
  try {
    return JSON.parse(text) as ContentDocument;
  } catch {
    return null;
  }
};

/**
 * `column` still holds exactly `value`. Compared as bytes: the tables' `utf8mb4_unicode_ci`
 * equality ignores case and accents, so a concurrent case-only edit would still match.
 */
const holds = (column: 'document' | 'html' | 'value', value: string) =>
  Prisma.sql`CAST(${Prisma.raw(column)} AS BINARY) = CAST(${value} AS BINARY)`;

/** HTML as a save renders it; null when the document is outside the editor schema. */
const rendered = (document: ContentDocument) => {
  try {
    return renderDocument(document);
  } catch (error) {
    if (error instanceof InvalidDocumentError) return null;
    throw error;
  }
};

/**
 * Removes injected link defaults from stored entries, revisions and patterns, and re-renders
 * the stored HTML of entries and patterns. Batched by primary key; rerunning changes nothing
 * once applied. Each write is conditional on the row still holding, byte for byte, what was
 * read, so a concurrent save is never overwritten (that row is reported as skipped).
 */
export async function migrateLinkDefaults(
  db: Database,
  { dryRun, batch }: Options,
): Promise<LinkDefaultsReport> {
  const report: LinkDefaultsReport = {
    contents: 0,
    revisions: 0,
    patterns: 0,
    skipped: [],
  };

  for (let cursor: string | undefined; ;) {
    const rows = await db.content.findMany({
      select: { id: true, document: true, html: true },
      orderBy: { id: 'asc' },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!rows.length) break;

    for (const row of rows) {
      const stored = parsed(row.document);
      const document = stored && (withoutLinkDefaults(stored) ?? stored);
      const html = document && rendered(document);

      if (!document || html === null) {
        report.skipped.push(`content ${row.id}`);
        continue;
      }

      const text =
        document === stored ? row.document : JSON.stringify(document);

      if (text === row.document && html === row.html) continue;

      if (!dryRun) {
        const count = await db.$executeRaw`
          UPDATE contents SET document = ${text}, html = ${html}
          WHERE id = ${row.id} AND ${holds('document', row.document)} AND ${holds('html', row.html)}
        `;

        if (!count) {
          report.skipped.push(`content ${row.id}`);
          continue;
        }
      }

      report.contents += 1;
    }

    cursor = rows.at(-1)!.id;
  }

  for (let cursor: string | undefined; ;) {
    const rows = await db.contentRevision.findMany({
      select: { id: true, document: true },
      orderBy: { id: 'asc' },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (!rows.length) break;

    for (const row of rows) {
      const stored = parsed(row.document);

      if (!stored) {
        report.skipped.push(`revision ${row.id}`);
        continue;
      }

      const document = withoutLinkDefaults(stored);

      if (!document) continue;

      if (!dryRun) {
        const count = await db.$executeRaw`
          UPDATE content_revisions SET document = ${JSON.stringify(document)}
          WHERE id = ${row.id} AND ${holds('document', row.document)}
        `;

        if (!count) {
          report.skipped.push(`revision ${row.id}`);
          continue;
        }
      }

      report.revisions += 1;
    }

    cursor = rows.at(-1)!.id;
  }

  for (let cursor: string | undefined; ;) {
    const rows = await db.setting.findMany({
      where: { key: { startsWith: PATTERN_PREFIX } },
      orderBy: { key: 'asc' },
      take: batch,
      ...(cursor ? { cursor: { key: cursor }, skip: 1 } : {}),
    });

    if (!rows.length) break;

    for (const row of rows) {
      let value: unknown;

      try {
        value = JSON.parse(row.value);
      } catch {
        report.skipped.push(`setting ${row.key}`);
        continue;
      }

      // Deleted patterns are stored as null.
      if (!value || typeof value !== 'object' || !('document' in value))
        continue;
      const pattern = value as { document: ContentDocument; html?: unknown };
      const document =
        withoutLinkDefaults(pattern.document) ?? pattern.document;
      const html = rendered(document);

      if (html === null) {
        report.skipped.push(`setting ${row.key}`);
        continue;
      }

      if (document === pattern.document && html === pattern.html) continue;

      if (!dryRun) {
        const count = await db.$executeRaw`
          UPDATE settings SET value = ${JSON.stringify({ ...pattern, document, html })}
          WHERE \`key\` = ${row.key} AND ${holds('value', row.value)}
        `;

        if (!count) {
          report.skipped.push(`setting ${row.key}`);
          continue;
        }
      }

      report.patterns += 1;
    }

    cursor = rows.at(-1)!.key;
  }

  return report;
}
