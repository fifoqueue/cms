import { z } from 'zod';
import { captchaWidgetSchema } from '@cms/sdk';
import type { CaptchaWidget } from '@cms/sdk';
import { captchaProviderIdSchema } from '@cms/sdk/plugin';
import type { CaptchaProviderDefinition } from '@cms/sdk/plugin';
import type { CaptchaCheck, CaptchaVerifier } from '#api/domain/security/ports';
import { parseInput } from '#api/shared/validation';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';

/** Newest provider for the selected id wins; failures fall through, never bypass verification. */
export class CaptchaRegistry implements CaptchaVerifier {
  private readonly entries = new Map<
    object,
    {
      id: string;
      provider: Omit<CaptchaProviderDefinition, 'widget'> & {
        widget?: CaptchaWidget;
      };
      core: boolean;
    }
  >();
  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}
  register(id: string, provider: CaptchaProviderDefinition) {
    return this.add(id, provider, false);
  }
  registerCore(id: string, provider: CaptchaProviderDefinition) {
    return this.add(id, provider, true);
  }
  private add(id: string, provider: CaptchaProviderDefinition, core: boolean) {
    parseInput(captchaProviderIdSchema, id);
    const label = parseInput(z.string().trim().min(1).max(100), provider.label);
    const token = {};
    this.entries.set(token, {
      id,
      core,
      provider: {
        label,
        verify: provider.verify.bind(provider),
        ...(provider.widget === undefined
          ? {}
          : { widget: parseInput(captchaWidgetSchema, provider.widget) }),
      },
    });
    return () => {
      this.entries.delete(token);
    };
  }
  list() {
    return [
      ...new Map(
        [...this.entries.values()].map(
          ({ id, provider }) => [id, { id, label: provider.label }] as const,
        ),
      ).values(),
    ];
  }
  widget(id: string) {
    const entry = [...this.entries.values()]
      .reverse()
      .find((entry) => entry.id === id);
    return entry?.provider.widget
      ? structuredClone(entry.provider.widget)
      : null;
  }
  async verify(input: CaptchaCheck): Promise<boolean> {
    for (const [token, entry] of [...this.entries].reverse()) {
      if (entry.id !== input.provider || !this.entries.has(token)) continue;
      if (entry.core)
        return z
          .boolean()
          .parse(await entry.provider.verify(structuredClone(input)));
      const result = await isolate(
        () => entry.provider.verify(structuredClone(input)),
        this.options.timeoutMs,
      );
      if (!this.entries.has(token)) continue;
      const parsed = result.ok ? z.boolean().safeParse(result.value) : null;
      if (parsed?.success) return parsed.data;
      this.options.logger.warn(
        `Captcha provider "${entry.id}" failed; using fallback`,
      );
    }
    return false;
  }
}
