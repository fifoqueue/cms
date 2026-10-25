import type { PrivacyErasureReport } from '@cms/sdk';

/** One eraser's outcome. `owner` is the plugin id, or null for core erasers. */
export interface ErasureRow {
  id: string;
  owner: string | null;
  key: string;
  /** Null when the eraser failed and needs follow-up. */
  result: { erased: number; retained: number; messages: string[] } | null;
}

/** Eraser ids are `core:<key>` or `<plugin id>:<key>`. */
const parse = (id: string) => {
  const split = id.indexOf(':');
  const owner = split < 0 ? id : id.slice(0, split);
  return {
    owner: owner === 'core' ? null : owner,
    key: split < 0 ? '' : id.slice(split + 1),
  };
};

/** Rows of an erasure report: core erasers first, then each plugin eraser, failures last. */
export const erasureRows = (report: PrivacyErasureReport): ErasureRow[] => [
  ...Object.entries(report.results)
    .map(([id, result]) => ({ id, ...parse(id), result }))
    .sort((a, b) => Number(a.owner !== null) - Number(b.owner !== null)),
  ...report.failed.map((id) => ({ id, ...parse(id), result: null })),
];
