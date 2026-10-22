import { SLOT_NAMES } from '@cms/sdk';
import type { SlotMap, SlotQuery } from '@cms/sdk';
import type { ContentClient } from '@cms/sdk/client';

export const emptySlots = () =>
  Object.fromEntries(
    SLOT_NAMES.map((name) => [name, []]),
  ) as unknown as SlotMap;

/** Slot HTML for a page. Plugins are optional, so a failure here never breaks the page. */
export const loadSlots = (
  api: ContentClient,
  query: SlotQuery,
): Promise<SlotMap> => api.slots(query).catch(() => emptySlots());
