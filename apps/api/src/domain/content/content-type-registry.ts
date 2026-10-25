import { contentTypeSchema } from '@cms/sdk';
import type { ContentTypeDefinition, ContentTypeInput } from '@cms/sdk';
import { z } from 'zod';

const keySchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Live declarations only. Removing a registration never writes stored content. */
export class ContentTypeRegistry {
  private readonly entries = new Map<string, ContentTypeDefinition>();

  constructor(builtins: readonly ContentTypeDefinition[]) {
    for (const definition of builtins) this.add(definition);
  }

  register(
    owner: string,
    key: string,
    definition: Omit<ContentTypeInput, 'key'>,
  ) {
    const id = `plugin:${keySchema.parse(owner)}:${keySchema.parse(key)}`;
    return this.add(
      contentTypeSchema.parse({ ...definition, key: id, builtin: false }),
    );
  }

  list(): ContentTypeDefinition[] {
    return structuredClone([...this.entries.values()]);
  }

  private add(definition: ContentTypeDefinition) {
    const entry = contentTypeSchema.parse(definition);
    this.entries.set(entry.key, entry);
    return () => {
      if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    };
  }
}
