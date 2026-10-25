import type { MailField, MailValues } from '#sdk/email';

export interface MediaStorageDriver {
  commit(
    files: readonly { key: string; bytes: Uint8Array }[],
    freeBytes: number,
  ): Promise<'stored' | 'low_space' | 'busy'>;
  read(
    key: string,
    range?: { start: number; end?: number },
  ): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
    start: number;
    end: number;
  } | null>;
  remove(keys: readonly string[]): Promise<void>;
}
export interface PluginStorageDriver {
  label: string;
  fields: MailField[];
  /** Existing keys must remain readable when settings change. Secrets stay server-side. */
  connect(settings: MailValues): MediaStorageDriver;
}
export interface StorageDriverRegistrar {
  register(key: string, definition: PluginStorageDriver): () => void;
}
