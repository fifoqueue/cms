import { ROLES, ROLE_CAPABILITIES, roleDefinitionSchema } from '@cms/sdk';
import type { RoleDefinition } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';

/** Defaults only. Saved administrator definitions and deletion tombstones take precedence. */
export class RoleRegistry {
  private readonly entries = new Map<object, RoleDefinition>();
  constructor() {
    for (const key of ROLES)
      this.register({
        key,
        name: key,
        capabilities: [...ROLE_CAPABILITIES[key]!],
      });
  }
  register(input: RoleDefinition, source = 'core') {
    const role = parseInput(roleDefinitionSchema, input);
    const token = {};
    this.entries.set(token, { ...role, source });
    return () => {
      this.entries.delete(token);
    };
  }
  list(): RoleDefinition[] {
    const roles = new Map<string, RoleDefinition>();
    for (const role of this.entries.values())
      if (!roles.has(role.key)) roles.set(role.key, structuredClone(role));
    return [...roles.values()];
  }
  has(key: string) {
    return [...this.entries.values()].some((role) => role.key === key);
  }
}
