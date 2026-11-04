import { ImportService } from '#api/domain/tools/import-service';
import { ExportService } from '#api/domain/tools/export-service';
import { DatabaseCleanupService } from '#api/domain/tools/database-cleanup';
import type { SiteService } from '#api/domain/site/site-service';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import type { PatternService } from '#api/domain/content/pattern-service';
import { outbound } from '#api/infra/egress-policy';
import { fastXmlWxrParser } from '#api/infra/wxr-parser';
import {
  randomTokenIssuer,
  systemClock,
  tiptapHtmlParser,
  uuidV7,
} from '#api/infra/system';

type ImportDeps = ConstructorParameters<typeof ImportService>[0];
type ExportDeps = ConstructorParameters<typeof ExportService>[0];
type Input = Pick<
  ImportDeps,
  | 'hooks'
  | 'importShortcodes'
  | 'content'
  | 'taxonomy'
  | 'types'
  | 'users'
  | 'redirects'
  | 'menus'
  | 'accounts'
> & {
  comments: ImportDeps['comments'] & ExportDeps['comments'];
  patterns: NonNullable<ImportDeps['patterns']> &
    Pick<PatternService, 'exportable'>;
  media: NonNullable<ImportDeps['attachments']>['media'];
  settings: NonNullable<ImportDeps['attachments']>['settings'];
  contentRepository: ExportDeps['content'];
  terms: ExportDeps['terms'];
  site: Pick<SiteService, 'get'>;
  seo: Pick<SeoSettingsService, 'getPublic'>;
};

export const createTools = ({
  media,
  settings,
  hooks,
  importShortcodes,
  content,
  taxonomy,
  types,
  comments,
  users,
  redirects,
  menus,
  accounts,
  patterns,
  contentRepository,
  terms,
  site,
  seo,
}: Input) => {
  const importer = new ImportService({
    attachments: {
      media,
      fetch: (url, init) => outbound.fetch(url, init),
      settings,
    },
    hooks,
    importShortcodes,
    parser: fastXmlWxrParser,
    html: tiptapHtmlParser,
    content,
    taxonomy,
    types,
    comments,
    users,
    ids: uuidV7,
    clock: systemClock,
    redirects,
    menus,
    accounts,
    tokens: randomTokenIssuer,
    patterns,
  });
  const exporter = new ExportService({
    hooks,
    content: contentRepository,
    patterns: () => patterns.exportable(),
    terms,
    comments,
    users,
    site: async () => ({
      title: (await site.get()).title,
      siteUrl: (await seo.getPublic()).siteUrl,
    }),
  });

  return { importer, exporter };
};

export const createCleanup = (
  input: Pick<
    ConstructorParameters<typeof DatabaseCleanupService>[0],
    'store' | 'leases'
  >,
) => new DatabaseCleanupService({ ...input, clock: systemClock, ids: uuidV7 });
