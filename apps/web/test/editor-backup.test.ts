import { expect, test } from 'bun:test';
import {
  claimBackups,
  clearBackups,
  editorBackup,
} from '#lib/admin/editor-backup.js';

/** sessionStorage as one browser tab keeps it. */
const tab = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
};

test("a shared tab never offers one account's unsaved text to another", () => {
  const storage = tab();
  claimBackups('a', storage);
  editorBackup('a', 'new:post', storage).write('CONFIDENTIAL A');
  expect(editorBackup('a', 'new:post', storage).read()).toBe('CONFIDENTIAL A');

  // B signs in without A signing out: B's first read drops A's backups.
  expect(editorBackup('b', 'new:post', storage).read()).toBeNull();
  expect(storage.length).toBe(1); // Only B's owner marker remains.
  expect(editorBackup('a', 'new:post', storage).read()).toBeNull();

  // A form still open from A cannot write A's text back once B owns the tab.
  const stale = editorBackup('a', 'entry-1', storage);
  claimBackups('b', storage);
  stale.write('LATE A');
  expect(storage.length).toBe(1);

  // Signing out removes every backup.
  editorBackup('b', 'entry-1', storage).write('B text');
  expect(storage.length).toBe(2);
  clearBackups(storage);
  expect(storage.length).toBe(0);
});
