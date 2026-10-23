import {
  DEFAULT_SECURITY_SETTINGS,
  PROTECTED_ACTIONS,
  adminSecuritySettingsSchema,
  securitySettingsInputSchema,
} from '@cms/sdk';
import type {
  AdminSecuritySettings,
  CaptchaProvider,
  PublicCaptcha,
} from '@cms/sdk';
import type { SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';

const KEY = 'security';

/** Settings with the decrypted captcha secret, for enforcement only. Never serialize this. */
export interface SecurityPolicy extends Omit<AdminSecuritySettings, 'captcha'> {
  captcha: Omit<AdminSecuritySettings['captcha'], 'secretConfigured'> & {
    secretKey: string | null;
  };
}

interface Stored {
  settings: Omit<AdminSecuritySettings, 'captcha'> & {
    captcha: Omit<AdminSecuritySettings['captcha'], 'secretConfigured'>;
  };
  /** Sealed captcha secret; empty when none. */
  secret: string;
}

/** Captcha provider and rate-limit rules. The captcha secret is stored encrypted. */
export class SecuritySettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly secrets: SecretBox,
  ) {}

  async getAdmin(): Promise<AdminSecuritySettings> {
    const { settings, secretKey } = await this.load();
    return adminSecuritySettingsSchema.parse({
      ...settings,
      captcha: { ...settings.captcha, secretConfigured: secretKey !== null },
    });
  }

  async policy(): Promise<SecurityPolicy> {
    const { settings, secretKey } = await this.load();
    return { ...settings, captcha: { ...settings.captcha, secretKey } };
  }

  /** What a frontend needs to render the widget; `none` until it can be verified. */
  async getPublic(): Promise<PublicCaptcha> {
    const { captcha } = await this.policy();
    const provider: CaptchaProvider =
      captcha.provider !== 'none' && captcha.siteKey && captcha.secretKey
        ? captcha.provider
        : 'none';
    return {
      provider,
      siteKey: provider === 'none' ? '' : captcha.siteKey,
      always:
        provider === 'none'
          ? []
          : PROTECTED_ACTIONS.filter(
              (action) => captcha.modes[action] === 'always',
            ),
    };
  }

  async update(input: unknown): Promise<AdminSecuritySettings> {
    const data = parseInput(securitySettingsInputSchema, input);
    const current = await this.stored();
    const { secretKey, ...captcha } = data.captcha;
    const secret =
      secretKey === undefined
        ? current.secret
        : secretKey
          ? this.secrets.seal(secretKey)
          : '';
    await this.settings.set(KEY, {
      settings: { captcha, rules: data.rules, media: data.media },
      secret,
    } satisfies Stored);
    return this.getAdmin();
  }

  private async load() {
    const { settings, secret } = await this.stored();
    return {
      settings,
      secretKey: secret ? this.secrets.open(secret) : null,
    };
  }

  /** The stored settings; defaults when missing or damaged. */
  private async stored(): Promise<Stored> {
    const raw = (await this.settings.get(KEY)) as Partial<Stored> | undefined;
    const { secretConfigured: _configured, ...captcha } =
      DEFAULT_SECURITY_SETTINGS.captcha;
    const parsed = securitySettingsInputSchema.safeParse(raw?.settings);
    return {
      settings: parsed.success
        ? {
            captcha: {
              provider: parsed.data.captcha.provider,
              siteKey: parsed.data.captcha.siteKey,
              minimumScore: parsed.data.captcha.minimumScore,
              modes: parsed.data.captcha.modes,
            },
            rules: parsed.data.rules,
            media: parsed.data.media,
          }
        : {
            captcha,
            rules: DEFAULT_SECURITY_SETTINGS.rules,
            media: DEFAULT_SECURITY_SETTINGS.media,
          },
      secret: typeof raw?.secret === 'string' ? raw.secret : '',
    };
  }
}
