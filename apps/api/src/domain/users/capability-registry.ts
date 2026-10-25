import { CAPABILITIES } from '@cms/sdk';
import { capabilityDefinitionSchema } from '@cms/sdk/plugin';
import type { CapabilityCatalog } from '#api/domain/users/user-capabilities';
import { parseInput } from '#api/shared/validation';

export interface CapabilityDefinition {
  key: string;
  label: string;
  source?: string;
}

/** Declarations are copied and revocable. The first declaration owns a key. */
export class CapabilityRegistry implements CapabilityCatalog {
  private readonly entries = new Map<object, CapabilityDefinition>();

  constructor() {
    for (const key of CAPABILITIES) this.register({ key, label: key });
  }

  register(input: CapabilityDefinition, source = 'core') {
    const definition = parseInput(capabilityDefinitionSchema, input);
    const token = {};
    this.entries.set(token, { ...definition, source });
    return () => {
      this.entries.delete(token);
    };
  }

  has(key: string) {
    return [...this.entries.values()].some((entry) => entry.key === key);
  }

  list(): CapabilityDefinition[] {
    const definitions = new Map<string, CapabilityDefinition>();
    for (const definition of this.entries.values())
      if (!definitions.has(definition.key))
        definitions.set(definition.key, { ...definition });
    return [...definitions.values()];
  }
}
