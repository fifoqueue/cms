import { z } from 'zod';

export const translationScopeSchema = z.enum(['site', 'admin', 'email']);

export const translationMessagesSchema = z.record(
  z.string().min(1).max(200),
  z.string().max(10000),
);

export const translationResponseSchema = z.object({
  locale: z.string().min(1).max(100),
  messages: translationMessagesSchema,
});

export type TranslationScope = z.output<typeof translationScopeSchema>;

export interface TranslationRegistrar {
  register(
    locale: string,
    catalog: Partial<Record<TranslationScope, Record<string, string>>>,
  ): () => void;
}

export interface I18nFilterHooks {
  'i18n.messages': {
    locale: string;
    scope: TranslationScope;
    messages: Record<string, string>;
  };
  'i18n.locale': {
    locale: string;
    scope: TranslationScope;
    userId: string | null;
  };
}
