import type {
  ContentData,
  ContentEntry,
  ContentListQuery,
  PublicContentCriteria,
  PublicContent,
  ContentDefaults,
} from '#sdk/content';
import type {
  ContentTypeDefinition,
  FieldDefinition,
  PermalinkSettings,
  ContentRevision,
} from '#sdk/index';
import type {
  AdminTaxonomyTerm,
  PublicTaxonomyTerm,
  TaxonomyData,
} from '#sdk/taxonomy';

/** Committed content lifecycle notifications. */
export interface ContentActionHooks {
  'content.statusChanged': ContentEntry & {
    previousStatus: ContentEntry['status'] | 'trash' | null;
  };
  'content.revisionSaved': ContentEntry;
  'content.autosaved': { contentId: string; revision: ContentRevision };
  'content.termsChanged': ContentEntry;
  'contentType.created': ContentTypeDefinition;
  'contentType.updated': ContentTypeDefinition;
  'contentType.deleted': ContentTypeDefinition;
  'field.created': FieldDefinition;
  'field.updated': FieldDefinition;
  'field.deleted': FieldDefinition;
  'permalinks.updated': PermalinkSettings;
  'term.created': AdminTaxonomyTerm;
  'term.updated': AdminTaxonomyTerm;
  'term.deleted': AdminTaxonomyTerm;
  'content.scheduled': ContentEntry;
  'content.revisionRestored': ContentEntry;
}

/** Validated authoring-list arguments, after core authorization. */
export interface ContentFilterHooks {
  'content.excerpt': {
    excerpt: string;
    contentId: string;
    source: 'manual' | 'generated';
    /** Changing these regenerates generated excerpts from the published body. */
    length?: number;
    more?: string;
  };
  'content.defaults': ContentDefaults;
  'content.html': {
    html: string;
    content: Pick<PublicContent, 'id' | 'type' | 'slug' | 'path' | 'title'>;
    context: 'single' | 'feed' | 'preview';
  };
  'contentType.definition': ContentTypeDefinition;
  'content.title': { title: string; contentId: string };
  'content.revisionsToKeep': { count: number; type: string };
  'content.slug': {
    slug: string;
    title: string;
    type: string;
    contentId: string | null;
  };
  'content.trashAllowed': boolean;
  'content.publicQuery': PublicContentCriteria;
  /** Added ids must identify published content of an active type. */
  'content.publicResults': { ids: string[]; total: number };
  /**
   * Validated content right before it is stored. Password-free: core re-applies the client's
   * password afterwards, so filters can neither read nor set it.
   */
  'content.beforeSave': Omit<ContentData, 'password'>;
  /** Core supplies the initial decision; every handler may return either boolean. */
  'content.publishAllowed': boolean;
  /** Core supplies the initial decision; every handler may return either boolean. */
  'content.deleteAllowed': boolean;
  'content.permalink': { contentId: string; path: string };
  'contentType.beforeSave': Omit<ContentTypeDefinition, 'builtin'>;
  'field.beforeSave': FieldDefinition;
  'term.beforeSave': TaxonomyData;
  'term.public': PublicTaxonomyTerm;
  'content.query': ContentListQuery;
}

export interface ContentFilterArgs {
  'content.excerpt': [context: Readonly<{ length: number; more: string }>];
  'content.defaults': [];
  'content.html': [];
  'contentType.definition': [];
  'content.beforeSave': [
    context: Readonly<{
      contentId: string | null;
      previous: ContentEntry | null;
      actorId: string;
    }>,
  ];
  'content.trashAllowed': [
    context: Readonly<{ content: ContentEntry; actorId: string }>,
  ];
  'content.publicQuery': [];
  'content.publicResults': [];
  'content.slug': [];
  'content.revisionsToKeep': [];
  'content.title': [];
}
