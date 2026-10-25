import {
  DEFAULT_SECURITY_SETTINGS,
  CAPTCHA_PROVIDERS,
  PROTECTED_ACTIONS,
  adminSecuritySettingsSchema,
  securitySettingsInputSchema,
  publicCaptchaSchema,
} from '@cms/sdk';
import type {
  AdminSecuritySettings,
  CaptchaProvider,
  PublicCaptcha,
  CaptchaWidget,
} from '@cms/sdk';
import { CORE_CAPTCHA_WIDGETS } from '#api/domain/security/captcha-widgets';
import type { HookDispatcher, SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';
import { invalidInput } from '#api/shared/errors';
import { Errors } from '@cms/sdk/errors';

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
    private readonly hooks?: HookDispatcher,
    private readonly providers: () => {
      id: string;
      label: string;
    }[] = () =>
      CAPTCHA_PROVIDERS.filter((id) => id !== 'none').map((id) => ({
        id,
        label: id,
      })),
    private readonly widget: (id: string) => CaptchaWidget | null = (id) =>
      CORE_CAPTCHA_WIDGETS[id] ?? null,
  ) {}

  captchaProviders() {
    return this.providers();
  }

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
    const widget = provider === 'none' ? null : this.widget(provider);
    return publicCaptchaSchema.parse({
      provider,
      siteKey: provider === 'none' ? '' : captcha.siteKey,
      always:
        provider === 'none'
          ? []
          : PROTECTED_ACTIONS.filter(
              (action) => captcha.modes[action] === 'always',
            ),
      widget: widget
        ? {
            script: widget.script,
            render: widget.render,
            origins: widget.origins,
            attributes:
              widget.render === null &&
              !Object.hasOwn(widget.attributes, 'data-sitekey')
                ? { ...widget.attributes, 'data-sitekey': captcha.siteKey }
                : widget.attributes,
            responseField: widget.responseField,
            scriptOrigin: new URL(widget.script).origin,
          }
        : null,
    });
  }

  async update(input: unknown): Promise<AdminSecuritySettings> {
    const data = parseInput(securitySettingsInputSchema, input);
    if (
      data.captcha.provider !== 'none' &&
      !this.providers().some(({ id }) => id === data.captcha.provider)
    )
      throw invalidInput(Errors.CaptchaProviderUnknown);
    const current = await this.stored();
    const { secretKey, ...captcha } = data.captcha;
    const secret =
      secretKey === undefined
        ? captcha.provider === current.settings.captcha.provider
          ? current.secret
          : ''
        : secretKey
          ? this.secrets.seal(secretKey)
          : '';
    await this.settings.set(KEY, {
      settings: { captcha, rules: data.rules, media: data.media },
      secret,
    } satisfies Stored);
    const result = await this.getAdmin();
    void this.hooks?.emit('security.updated', result);
    return result;
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
