import { CAPABILITIES } from '@cms/sdk';
import type { Capability } from '@cms/sdk';
import { z } from 'zod';
import type { HookDispatcher } from '#api/domain/ports';
import type { Logger } from '#api/shared/logger';

/** Read side of the capability registry; declarations and role editing arrive in chunk B. */
export interface CapabilityCatalog {
  has(capability: string): boolean;
}

export const coreCapabilities: CapabilityCatalog = {
  has: (capability) => (CAPABILITIES as readonly string[]).includes(capability),
};

const resultSchema = z.strictObject({
  userId: z.string().min(1),
  role: z.string().min(1),
  capabilities: z.array(z.string().min(1).max(191)).max(1000),
});

/** Resolves a verified user's capabilities. Callers must never use client-supplied identities. */
export class UserCapabilities {
  private readonly grants = new Set<string>();

  constructor(
    private readonly hooks: HookDispatcher,
    private readonly catalog: CapabilityCatalog,
    private readonly logger: Logger,
  ) {}

  async resolve(
    user: { id: string; role: string } | null,
    roleCapabilities: readonly Capability[],
  ): Promise<Capability[]> {
    if (!user?.id) return [];
    const base = roleCapabilities.filter((capability) =>
      this.catalog.has(capability),
    );
    const result = await this.hooks.applyFilter(
      'user.capabilities',
      { userId: user.id, role: user.role, capabilities: [...base] },
      (value) => {
        const parsed = resultSchema.safeParse(value);
        return (
          parsed.success &&
          parsed.data.userId === user.id &&
          parsed.data.role === user.role &&
          parsed.data.capabilities.every((capability) =>
            this.catalog.has(capability),
          )
        );
      },
      (owner, previous, next) => {
        for (const capability of next.capabilities) {
          if (
            base.includes(capability) ||
            previous.capabilities.includes(capability)
          )
            continue;
          const key = JSON.stringify([owner, user.id, capability]);
          if (this.grants.has(key)) continue;
          this.grants.add(key);
          this.logger.warn(`Capability grant ${key}`);
        }
      },
    );
    return [...new Set(result.capabilities)];
  }
}
