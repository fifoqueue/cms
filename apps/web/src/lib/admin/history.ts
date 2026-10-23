/** Steps the site editor keeps. */
const LIMIT = 100;
/** Changes closer together than this (typing) merge into one step. */
const MERGE_MS = 500;

/** Undo and redo over serialized snapshots of what is being edited. */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  private changedAt = 0;

  constructor(private current: string) {}

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  /** Records `next` as the current state; redo is lost, as in every editor. */
  record(next: string, now = Date.now()) {
    if (next === this.current) return;
    if (!this.past.length || now - this.changedAt > MERGE_MS) {
      this.past.push(this.current);
      if (this.past.length > LIMIT) this.past.shift();
    }
    this.changedAt = now;
    this.current = next;
    this.future = [];
  }

  /** The state to restore, or null when there is nothing to undo. */
  undo(): string | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.current);
    this.current = previous;
    this.changedAt = 0;
    return previous;
  }

  redo(): string | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.changedAt = 0;
    return next;
  }
}

/** Ctrl/Cmd+Z undoes, with Shift (or Ctrl+Y) redoes; text fields keep their own undo. */
export const historyKey = (event: KeyboardEvent): 'undo' | 'redo' | null => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input:not([type=checkbox]):not([type=color]), textarea'))
    return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  return key === 'y' ? 'redo' : null;
};
