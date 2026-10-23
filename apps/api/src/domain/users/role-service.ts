import {
  ROLES,
  ROLE_CAPABILITIES,
  roleDefinitionSchema,
  roleDeleteSchema,
} from '@cms/sdk';
import type { RoleDefinition, Capability } from '@cms/sdk';
import type { RoleWriter } from '#api/domain/users/user-directory';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/** Role definitions are validated again when resolving a session. */
export class RoleService {
  constructor(
    private readonly settings: SettingsRepository,
    /** Definition and assignment writes serialized by the repository's shared user lock. */
    private readonly writer: RoleWriter,
  ) {}

  async list(): Promise<RoleDefinition[]> {
    const stored = await this.settings.list('role.');
    const roles: RoleDefinition[] = ROLES.map((key) => ({
      key,
      name: key,
      capabilities: [...ROLE_CAPABILITIES[key]!],
    }));
    for (const value of Object.values(stored)) {
      const parsed = roleDefinitionSchema.safeParse(value);
      if (
        parsed.success &&
        !ROLES.includes(parsed.data.key as (typeof ROLES)[number])
      )
        roles.push(parsed.data);
    }
    return roles;
  }

  async capabilities(key: string): Promise<Capability[]> {
    return (
      (await this.list()).find((role) => role.key === key)?.capabilities ?? []
    );
  }

  async require(key: string) {
    if (!(await this.list()).some((role) => role.key === key))
      throw invalidInput(Errors.RoleUnknown);
  }

  async save(input: unknown, actor: Actor) {
    authorize(actor, 'users.manage');
    const role = parseInput(roleDefinitionSchema, input);
    if ((ROLES as readonly string[]).includes(role.key))
      throw invalidInput(Errors.RoleBuiltin);
    await this.writer.saveRole(role);
    return role;
  }

  /**
   * Deletes a custom role after moving its users to `reassignTo`, another existing role. The
   * settings store has no delete, so the definition is replaced by null, which `list` skips.
   */
  async remove(key: string, input: unknown, actor: Actor) {
    authorize(actor, 'users.manage');
    const { reassignTo } = parseInput(roleDeleteSchema, input);
    const roles = await this.list();
    if ((ROLES as readonly string[]).includes(key))
      throw invalidInput(Errors.RoleBuiltin);
    if (!roles.some((role) => role.key === key))
      throw notFound(Errors.RoleUnknown);
    if (reassignTo === key || !roles.some((role) => role.key === reassignTo))
      throw invalidInput(Errors.RoleUnknown, [
        { path: 'reassignTo', message: Errors.RoleUnknown },
      ]);
    await this.writer.removeRole(key, reassignTo);
  }
}
