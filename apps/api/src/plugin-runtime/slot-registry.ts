import { SLOT_NAMES } from '@cms/sdk';
import type { SlotMap, SlotName } from '@cms/sdk';
import type { SlotContext, SlotRegistrar, SlotRenderer } from '@cms/sdk/plugin';
import { isolate } from '../shared/isolate';
import type { Logger } from '../shared/logger';

interface Contribution {
  owner: string;
  slot: SlotName;
  renderer: SlotRenderer;
}

export interface SlotRegistryOptions {
  timeoutMs: number;
  logger: Logger;
}

/** Collects HTML fragments for the frontend slots. A failing renderer contributes nothing. */
export class SlotRegistry {
  private contributions: Contribution[] = [];

  constructor(private readonly options: SlotRegistryOptions) {}

  registrar(owner: string): SlotRegistrar {
    return {
      provide: (slot, renderer) => {
        if (!SLOT_NAMES.includes(slot))
          throw new Error(`Unknown slot "${slot}"`);
        const contribution = { owner, slot, renderer };
        this.contributions = [...this.contributions, contribution];
        return () => {
          this.contributions = this.contributions.filter(
            (entry) => entry !== contribution,
          );
        };
      },
    };
  }

  async render(context: Omit<SlotContext, 'slot'>): Promise<SlotMap> {
    const slots = Object.fromEntries(
      SLOT_NAMES.map((name) => [name, [] as string[]]),
    ) as SlotMap;
    const results = await Promise.all(
      this.contributions.map(async ({ owner, slot, renderer }) => ({
        owner,
        slot,
        result: await isolate(
          () => renderer({ ...structuredClone(context), slot }),
          this.options.timeoutMs,
        ),
      })),
    );
    for (const { owner, slot, result } of results) {
      if (result.ok && typeof result.value === 'string') {
        if (result.value) slots[slot].push(result.value);
      } else {
        const reason = result.ok
          ? 'returned a non-string value'
          : result.error.message;
        this.options.logger.warn(
          `Plugin "${owner}" failed to render slot "${slot}": ${reason}`,
        );
      }
    }
    return slots;
  }
}
