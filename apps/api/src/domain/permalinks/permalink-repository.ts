import type { PermalinkSettings } from '@cms/sdk';

export interface PathOwner {
  contentId: string;
  /** False for a permanent redirect left by an earlier path. */
  current: boolean;
}

/** Exact path lookup: byte-equal, never case-, accent- or encoding-folded. */
export interface PathLookup {
  /** Owner of the current path or redirect `path`, whatever the content's status. */
  findByPath(path: string): Promise<PathOwner | null>;
}

/** Adds old addresses of imported content as permanent redirects. */
export interface RedirectWriter {
  /**
   * Records `path` as a redirect to `contentId`, serialized with path writes. False (nothing
   * written) when the path is not a valid unreserved content path, lies under an archive base or
   * is already someone's path or redirect.
   */
  addRedirect(contentId: string, path: string): Promise<boolean>;
}

export interface PermalinkRepository extends PathLookup {
  /** Stored templates through `readPermalinkSettings`; defaults when never saved. */
  readSettings(): Promise<PermalinkSettings>;
  /**
   * Stores `settings` and moves every content item to its `contentPath`, atomically and
   * serialized with content writes. Old paths of ever-published content (`publishedAt` set) stay
   * as redirects; others are released. An unchanged current path is kept even if now reserved. Throws `invalid_input`/`conflict` (`pathChanges`/`planPathChanges`) with nothing
   * changed: the previous settings and paths remain.
   */
  saveSettings(settings: PermalinkSettings): Promise<void>;
}
