import { SLOT_NAMES } from '@cms/sdk';
import type { SlotMap, SlotName } from '@cms/sdk';
import type { SlotContext, SlotRegistrar, SlotRenderer } from '@cms/sdk/plugin';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { Errors } from '#api/shared/errors';

interface Contribution {
  owner: string;
  slot: SlotName;
  renderer: SlotRenderer;
}

export interface SlotRegistryOptions {
  timeoutMs: number;
  logger: Logger;
}

/** Every slot, each without fragments. */
export const emptySlots = (): SlotMap =>
  Object.fromEntries(
    SLOT_NAMES.map((name) => [name, [] as string[]]),
  ) as SlotMap;

/** Collects HTML fragments for the frontend slots. A failing renderer contributes nothing. */
export class SlotRegistry {
  private contributions: Contribution[] = [];

  constructor(private readonly options: SlotRegistryOptions) {}

  registrar(owner: string): SlotRegistrar {
    return {
      provide: (slot, renderer) => {
        if (!SLOT_NAMES.includes(slot))
          throw new Error(Errors.PluginSlotUnknown(slot));
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

  /** True while no renderer is registered for any slot. */
  get empty(): boolean {
    return this.contributions.length === 0;
  }

  async render(context: Omit<SlotContext, 'slot'>): Promise<SlotMap> {
    const slots = emptySlots();
    const results = await Promise.all(
      this.contributions.map(async (entry) => ({
        entry,
        result: await isolate(
          () =>
            this.contributions.includes(entry)
              ? entry.renderer({
                  ...structuredClone(context),
                  slot: entry.slot,
                })
              : '',
          this.options.timeoutMs,
        ),
      })),
    );
    for (const { entry, result } of results) {
      if (!this.contributions.includes(entry)) continue;
      const { owner, slot } = entry;
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
