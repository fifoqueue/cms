import type { SecretBox } from '#api/domain/ports';
import type { TotpMaintenanceRepository } from '#api/domain/auth/totp/ports';

/**
 * Run with the current and previous keys configured on every instance before retiring the
 * previous key. Unreadable secrets are preserved; skipped rows changed concurrently and can
 * be visited again. Pending enrollments must finish or expire before removing the old key.
 */
export const resealTotpSecrets = async (deps: {
  secrets: TotpMaintenanceRepository;
  box: SecretBox;
}): Promise<{ resealed: number; unreadable: number; skipped: number }> => {
  const result = { resealed: 0, unreadable: 0, skipped: 0 };
  let afterId: string | null = null;
  for (;;) {
    const rows = await deps.secrets.scan(afterId, 100);
    if (!rows.length) return result;
    for (const row of rows) {
      const secret = deps.box.open(row.sealedSecret);
      if (!secret || !/^[A-Z2-7]{32}$/.test(secret)) {
        result.unreadable++;
      } else if (
        await deps.secrets.reseal(
          row.id,
          row.sealedSecret,
          deps.box.seal(secret),
        )
      ) {
        result.resealed++;
      } else {
        result.skipped++;
      }
    }
    afterId = rows[rows.length - 1]!.id;
  }
};
