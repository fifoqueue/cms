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
   * Moves content in collision-checked batches before publishing settings. Successful batches
   * may survive an interrupted call; submitting the same settings resumes from durable progress.
   * Old published paths remain redirects. Writers are refused during pending regeneration.
   * A different settings submission restarts the scan with the new target. Each failed batch
   * is atomic; already committed batches are not rolled back.
   */
  saveSettings(settings: PermalinkSettings): Promise<void>;
}
