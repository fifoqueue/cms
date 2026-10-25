import type { CapabilityInfo } from '@cms/sdk';

export interface CapabilityGroup {
  /** Plugin id that registered them; null for capabilities saved roles hold but nobody registers. */
  source: string | null;
  capabilities: { key: string; label: string }[];
}

/**
 * Capabilities outside the core list, grouped by the plugin that registered them, then any
 * that saved roles still hold (listed so saving a role keeps them). `registered` is null when
 * the catalog could not be read.
 */
export const capabilityGroups = (
  registered: readonly CapabilityInfo[] | null,
  roles: readonly { capabilities: readonly string[] }[],
  core: readonly string[],
): CapabilityGroup[] => {
  const groups = new Map<string, CapabilityGroup>();
  const known = new Set(core);
  for (const { key, label, source } of registered ?? []) {
    if (known.has(key)) continue;
    known.add(key);
    const group = groups.get(source) ?? { source, capabilities: [] };
    group.capabilities.push({ key, label });
    groups.set(source, group);
  }
  const held = [...new Set(roles.flatMap((role) => role.capabilities))]
    .filter((key) => !known.has(key))
    .sort()
    .map((key) => ({ key, label: key }));
  return [
    ...[...groups.values()].sort((a, b) =>
      String(a.source).localeCompare(String(b.source)),
    ),
    ...(held.length ? [{ source: null, capabilities: held }] : []),
  ];
};

/** The plugin that contributed a role; null for core and administrator-made roles. */
export const rolePlugin = (source: string | undefined) =>
  source && source !== 'core' && source !== 'admin' ? source : null;
