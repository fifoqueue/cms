import { z } from 'zod';
import {
  contentTypeSchema,
  fieldDefinitionSchema,
  publicContentTypeSchema,
} from '#sdk/content-types';
import type {
  ContentTypeDefinition,
  ContentTypeInput,
  FieldDefinition,
  FieldDefinitionInput,
  PublicContentType,
} from '#sdk/content-types';
import type { Request } from '#sdk/transport';

export const publicTypesClient = (request: Request) => ({
  contentTypes: () =>
    request<PublicContentType[]>('GET', '/api/v1/content-types', {
      response: z.array(publicContentTypeSchema),
    }),
});

/** Content types and custom fields; reading needs `content.create`, changes `fields.manage`. */
export const contentModelClient = (request: Request) => {
  const typePath = (key: string) =>
    `/api/v1/admin/content-types/${encodeURIComponent(key)}`;
  const fieldPath = (key: string) =>
    `/api/v1/admin/fields/${encodeURIComponent(key)}`;
  return {
    model: () =>
      request<{ types: ContentTypeDefinition[]; fields: FieldDefinition[] }>(
        'GET',
        '/api/v1/admin/content-types',
        {
          response: z.object({
            types: z.array(contentTypeSchema),
            fields: z.array(fieldDefinitionSchema),
          }),
        },
      ),
    types: {
      create: (input: ContentTypeInput) =>
        request<ContentTypeDefinition>('POST', '/api/v1/admin/content-types', {
          json: input,
          response: contentTypeSchema,
        }),
      update: (key: string, input: ContentTypeInput) =>
        request<ContentTypeDefinition>('PUT', typePath(key), {
          json: input,
          response: contentTypeSchema,
        }),
      remove: (key: string) => request<void>('DELETE', typePath(key)),
    },
    fields: {
      create: (input: FieldDefinitionInput) =>
        request<FieldDefinition>('POST', '/api/v1/admin/fields', {
          json: input,
          response: fieldDefinitionSchema,
        }),
      update: (key: string, input: FieldDefinitionInput) =>
        request<FieldDefinition>('PUT', fieldPath(key), {
          json: input,
          response: fieldDefinitionSchema,
        }),
      remove: (key: string) => request<void>('DELETE', fieldPath(key)),
    },
  };
};
