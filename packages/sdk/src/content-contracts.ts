import type { ContentTypeInput } from '#sdk/content-types';
import type { Unsubscribe } from '#sdk/plugin';
import type { TaxonomyDefinitionInput } from '#sdk/taxonomy';
import type { FieldDefinitionInput } from '#sdk/content-types';

export interface TaxonomyRegistrar {
  register(
    key: string,
    definition: Omit<TaxonomyDefinitionInput, 'key'>,
  ): Unsubscribe;
}

export interface FieldRegistrar {
  register(
    key: string,
    definition: Omit<FieldDefinitionInput, 'key'>,
  ): Unsubscribe;
}

export interface ContentTypeRegistrar {
  /** Registered as plugin:<plugin id>:<key>; removal preserves stored entries. */
  register(key: string, definition: Omit<ContentTypeInput, 'key'>): Unsubscribe;
}
