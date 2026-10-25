import type { ContentDocument, WritingSettings } from '@cms/sdk';
import { renderDocument } from '@cms/content/render';
import type {
  ContentRecord,
  ContentRepository,
} from '#api/domain/content/content-repository';
import type { PublishedRecord } from '#api/domain/content/published-content-repository';

/** Only applicable, authorized snapshots incur an authoring read and render. */
export class TocRenderer {
  constructor(
    private readonly deps: {
      content: Pick<ContentRepository, 'findByIds'>;
      settings: () => Promise<{ writing: WritingSettings; locale: string }>;
    },
  ) {}

  async published(
    snapshots: readonly PublishedRecord[],
    visibility: 'published' | 'private',
  ): Promise<Map<string, string>> {
    const html = new Map(
      snapshots.map((snapshot) => [snapshot.id, snapshot.html]),
    );
    const candidates = snapshots.filter(
      (snapshot) => snapshot.tocOverride !== 'never',
    );
    if (!candidates.length) return html;
    const { writing, locale } = await this.deps.settings();
    const eligible = candidates.filter(
      (snapshot) =>
        snapshot.tocOverride === 'always' ||
        (writing.autoToc.enabled &&
          writing.autoToc.types.includes(snapshot.type)),
    );
    if (!eligible.length) return html;
    const records = new Map(
      (
        await this.deps.content.findByIds(
          eligible.map((snapshot) => snapshot.id),
        )
      ).map((record) => [record.id, record]),
    );
    // Rendering is synchronous and sequential, never one concurrent task per entry.
    for (const snapshot of eligible) {
      const current = records.get(snapshot.id);
      // Never combine newly fetched authoring content with an earlier authorization.
      // HTML equality also catches text changes saved within the same timestamp tick.
      if (
        !current ||
        current.updatedAt.getTime() !== snapshot.updatedAt.getTime() ||
        current.status !== visibility ||
        current.trashedAt !== null ||
        current.protected !== snapshot.protected ||
        current.html !== snapshot.html ||
        current.type !== snapshot.type ||
        (current.tocOverride ?? 'default') !==
          (snapshot.tocOverride ?? 'default')
      )
        continue;
      html.set(
        snapshot.id,
        automaticToc(
          current.document,
          snapshot.type,
          snapshot.tocOverride,
          writing,
          locale,
        ),
      );
    }
    return html;
  }

  async preview(
    document: ContentDocument,
    record: ContentRecord,
  ): Promise<string> {
    const { writing, locale } = await this.deps.settings();
    return automaticToc(
      document,
      record.type,
      record.tocOverride,
      writing,
      locale,
    );
  }
}

/** Request-time rendering keeps existing entries in step with writing settings. */
export function automaticToc(
  document: ContentDocument,
  type: string,
  override: 'default' | 'always' | 'never' | undefined,
  settings: WritingSettings,
  locale: string,
): string {
  const toc = settings.autoToc;
  return renderDocument(document, {
    enabled: toc.enabled && toc.types.includes(type),
    override,
    position: toc.position === 'top' ? 'top' : 'before-heading',
    attrs: {
      title: toc.title || (locale === 'ko' ? '목차' : 'Contents'),
      levels: toc.levels,
      minHeadings: toc.minHeadings,
      collapsible: toc.collapsible,
      open: toc.open,
    },
  });
}
