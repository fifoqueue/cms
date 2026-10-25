import { z } from 'zod';
import type { SecretBox } from '#api/domain/ports';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import { Errors } from '#api/shared/errors';

const KEY = 'push.vapid';

const storedSchema = z.object({
  /** base64url, uncompressed P-256 point. Public by design. */
  publicKey: z.string().min(1),
  /** Sealed base64url PKCS#8 private key. */
  privateKey: z.string().min(1),
});

/**
 * The site's VAPID key pair, generated once under the settings lock so every process uses the
 * same pair. Only the public key ever leaves the API; the private key is sealed at rest.
 */
export class VapidKeys {
  private cached: { publicKey: string; privateKey: string } | null = null;

  constructor(
    private readonly deps: {
      transactions: SettingsTransactions;
      secrets: SecretBox;
      generate: () => Promise<{ publicKey: string; privateKey: string }>;
    },
  ) {}

  async publicKey(): Promise<string> {
    return (await this.stored()).publicKey;
  }

  /** The pair with the private key opened. */
  async pair(): Promise<{ publicKey: string; privateKey: string }> {
    if (this.cached) return this.cached;
    const stored = await this.stored();
    const privateKey = this.deps.secrets.open(stored.privateKey);
    if (!privateKey) throw new Error(Errors.PushKeyUnreadable);
    this.cached = { publicKey: stored.publicKey, privateKey };
    return this.cached;
  }

  private saved: z.output<typeof storedSchema> | undefined;

  /** The pair never changes once stored, so one read per process suffices. */
  private async stored() {
    this.saved ??= await this.load();
    return this.saved;
  }

  private load() {
    return this.deps.transactions.run(KEY, async (settings) => {
      const current = storedSchema.safeParse(await settings.get(KEY));
      if (current.success) return current.data;
      const pair = await this.deps.generate();
      const stored = {
        publicKey: pair.publicKey,
        privateKey: this.deps.secrets.seal(pair.privateKey),
      };
      await settings.set(KEY, stored);
      return stored;
    });
  }
}
