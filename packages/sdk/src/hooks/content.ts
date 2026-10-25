import type { ContentData, ContentEntry, ContentListQuery } from '#sdk/content';
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
  /**
   * Validated content right before it is stored. Password-free: core re-applies the client's
   * password afterwards, so filters can neither read nor set it.
   */
  'content.beforeSave': Omit<ContentData, 'password'>;
  /** Additional veto after core permissions; a refusal cannot be reversed. */
  'content.publishAllowed': boolean;
  'content.deleteAllowed': boolean;
  'content.permalink': { contentId: string; path: string };
  'contentType.beforeSave': Omit<ContentTypeDefinition, 'builtin'>;
  'field.beforeSave': FieldDefinition;
  'term.beforeSave': TaxonomyData;
  'term.query': { taxonomy: string };
  'term.public': PublicTaxonomyTerm;
  'content.query': ContentListQuery;
}
