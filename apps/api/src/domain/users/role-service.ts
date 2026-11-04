import { ROLES, roleDefinitionSchema, roleDeleteSchema } from '@cms/sdk';
import type { RoleDefinition, Capability } from '@cms/sdk';
import type { RoleWriter } from '#api/domain/users/user-directory';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { forbidden, invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';
import type { UserCapabilities } from '#api/domain/users/user-capabilities';
import { CapabilityRegistry } from '#api/domain/users/capability-registry';
import { RoleRegistry } from '#api/domain/users/role-registry';
import { z } from 'zod';

/** Role definitions are validated again when resolving a session. */
export class RoleService {
  constructor(
    private readonly settings: SettingsRepository,
    /** Definition and assignment writes serialized by the repository's shared user lock. */
    private readonly writer: RoleWriter,
    private readonly hooks?: HookDispatcher,
    private readonly resolver?: Pick<UserCapabilities, 'resolve'>,
    private readonly catalog = new CapabilityRegistry(),
    private readonly defaults = new RoleRegistry(),
  ) {}

  async list(): Promise<RoleDefinition[]> {
    const stored = await this.settings.list('role.');
    const roles = new Map(this.defaults.list().map((role) => [role.key, role]));
    for (const [setting, value] of Object.entries(stored)) {
      const key = setting.slice('role.'.length);
      if ((ROLES as readonly string[]).includes(key)) continue;
      if (value === null) {
        roles.delete(key);
        continue;
      }
      const parsed = roleDefinitionSchema.safeParse(value);
      if (
        parsed.success &&
        !ROLES.includes(parsed.data.key as (typeof ROLES)[number])
      )
        roles.set(parsed.data.key, { ...parsed.data, source: 'admin' });
    }
    return [...roles.values()];
  }

  async capabilities(key: string, userId?: string): Promise<Capability[]> {
    const capabilities = (
      (await this.list()).find((role) => role.key === key)?.capabilities ?? []
    ).filter((capability) => this.catalog.has(capability));
    return userId && this.resolver
      ? this.resolver.resolve({ id: userId, role: key }, capabilities)
      : capabilities;
  }

  async assignable(actor: Actor): Promise<RoleDefinition[]> {
    const roles = await this.list();
    const capabilities = new Set(
      actor.capabilities ?? (await this.capabilities(actor.role, actor.id)),
    );
    const eligible = roles.filter(
      (role) => actor.role === 'administrator' || role.key !== 'administrator',
    );
    const baseline = eligible.filter(
      (role) =>
        actor.role === 'administrator' ||
        role.capabilities.every((capability) => capabilities.has(capability)),
    );

    if (!this.hooks?.has('role.assignable')) return baseline;

    const keys = new Set(eligible.map((role) => role.key));
    const schema = z.strictObject({
      actorId: z.literal(actor.id),
      roles: z
        .array(z.string())
        .max(keys.size)
        .refine(
          (values) =>
            new Set(values).size === values.length &&
            values.every((key) => keys.has(key)),
        ),
    });
    const result = await this.hooks.applyFilter(
      'role.assignable',
      { actorId: actor.id, roles: baseline.map((role) => role.key) },
      (value) => schema.safeParse(value).success,
    );

    return result.roles.map((key) => roles.find((role) => role.key === key)!);
  }

  async requireAssignable(key: string, actor: Actor) {
    if (!(await this.assignable(actor)).some((role) => role.key === key))
      throw invalidInput(Errors.RoleUnknown);
  }

  capabilityDefinitions() {
    return this.catalog.list();
  }

  async require(key: string) {
    if (!(await this.list()).some((role) => role.key === key))
      throw invalidInput(Errors.RoleUnknown);
  }

  async save(input: unknown, actor: Actor) {
    authorize(actor, 'users.manage');

    const role = {
      ...parseInput(roleDefinitionSchema, input),
      source: 'admin',
    };

    if (role.capabilities.some((key) => !this.catalog.has(key)))
      throw invalidInput(Errors.RoleUnknown);

    if ((ROLES as readonly string[]).includes(role.key))
      throw invalidInput(Errors.RoleBuiltin);

    const previous = (await this.list()).find((item) => item.key === role.key);

    if (actor.role !== 'administrator') {
      const ceiling = new Set(
        actor.capabilities ?? (await this.capabilities(actor.role, actor.id)),
      );

      if (
        role.capabilities.some(
          (capability) =>
            !ceiling.has(capability) ||
            (role.key === actor.role &&
              !previous?.capabilities.includes(capability)),
        )
      )
        throw forbidden();
    }

    await this.writer.saveRole(role);
    void this.hooks?.emit(previous ? 'role.updated' : 'role.created', role);

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
    await this.requireAssignable(reassignTo, actor);

    await this.writer.removeRole(key, reassignTo);
    void this.hooks?.emit('role.deleted', {
      role: roles.find((role) => role.key === key)!,
      reassignTo,
    });
  }
}
