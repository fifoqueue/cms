import type { PublicTheme } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { Clock, Signer } from '#api/domain/ports';
import type { ThemeService } from '#api/domain/theme/theme-service';
import { notFound, Errors } from '#api/shared/errors';

/** A preview lasts this long. */
const PREVIEW_MS = 30 * 60 * 1000;

/** Signed, expiring tokens that show an inactive theme on the public site (Appearance → Preview). */
export class ThemePreviews {
  constructor(
    private readonly deps: {
      themes: Pick<ThemeService, 'find'>;
      signer: Signer;
      clock: Clock;
    },
  ) {}

  async issue(id: string, actor: Actor): Promise<{ token: string }> {
    authorize(actor, 'appearance.manage');
    if (!(await this.deps.themes.find(id)))
      throw notFound(Errors.ThemeNotFound);
    const payload = `theme.${id}.${this.deps.clock.now().getTime() + PREVIEW_MS}`;
    return { token: `${payload}.${this.deps.signer.sign(payload)}` };
  }

  /** The previewed theme, or `null` for a missing, forged or expired token. */
  async resolve(token: string | undefined): Promise<PublicTheme | null> {
    const [kind, id, expires, signature] = token?.split('.') ?? [];
    if (
      kind !== 'theme' ||
      !id ||
      !signature ||
      !this.deps.signer.verify(`${kind}.${id}.${expires}`, signature) ||
      Number(expires) < this.deps.clock.now().getTime()
    )
      return null;
    const theme = await this.deps.themes.find(id);
    return theme && { ...theme, preview: true };
  }
}
