import { adminEgressSettingsSchema, egressSettingsInputSchema } from '@cms/sdk';
import type { AdminEgressSettings, EgressRule, EgressService } from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseRange } from '#api/shared/ip-address';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

const KEY = 'egress';

const validateRanges = (rules: readonly EgressRule[]) => {
  for (const [index, rule] of rules.entries())
    for (const [addressIndex, address] of rule.addresses.entries())
      if (!parseRange(address))
        throw invalidInput(Errors.EgressAddressInvalid, [
          {
            path: `rules.${index}.addresses.${addressIndex}`,
            message: Errors.EgressAddressInvalid,
          },
        ]);
};

/** Administrator-owned private-network exceptions plus visible environment overrides. */
export class EgressSettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly environmentRules: readonly EgressRule[] = [],
    private readonly hooks?: HookDispatcher,
  ) {
    validateRanges(environmentRules);
  }

  async getAdmin(): Promise<AdminEgressSettings> {
    return adminEgressSettingsSchema.parse({
      rules: await this.stored(),
      environmentRules: this.environmentRules,
    });
  }

  async update(input: unknown): Promise<AdminEgressSettings> {
    const { rules } = parseInput(egressSettingsInputSchema, input);
    validateRanges(rules);
    await this.settings.set(KEY, { rules });
    const result = await this.getAdmin();
    void this.hooks?.emit('egress.updated', result);
    return result;
  }

  async rules(service: EgressService): Promise<EgressRule[]> {
    return [...(await this.stored()), ...this.environmentRules].filter(
      (rule) => rule.service === service,
    );
  }

  /** One-time compatibility snapshot for existing local search and mail settings. */
  async initialize(rules: () => Promise<readonly EgressRule[]>) {
    if ((await this.settings.get(KEY)) !== undefined) return;
    const initial = await rules();
    validateRanges(initial);
    await this.settings.set(KEY, { rules: initial });
  }

  private async stored(): Promise<EgressRule[]> {
    const parsed = egressSettingsInputSchema.safeParse(
      await this.settings.get(KEY),
    );
    if (!parsed.success) return [];
    validateRanges(parsed.data.rules);
    return parsed.data.rules;
  }
}
