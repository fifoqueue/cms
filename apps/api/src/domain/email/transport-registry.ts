import type {
  EmailMessage,
  Mailer,
  MailTransport,
} from '#api/domain/email/ports';
import { Errors } from '#api/shared/errors';
import { isolate } from '#api/shared/isolate';
import { z } from 'zod';
import { mailFieldSchema, pluginMailIdSchema } from '@cms/sdk';
import type { PluginMailTransport, MailValues } from '@cms/sdk';

/** Explicit selection only: a missing or failed transport never sends via another provider. */
export class MailTransportRegistry implements Mailer {
  constructor(private readonly timeoutMs = 60_000) {}
  private readonly transports = new Map<string, Mailer>();
  private readonly plugins = new Map<
    string,
    { label: string; fields: PluginMailTransport['fields'] }
  >();

  plugin(
    owner: string,
    key: string,
    definition: PluginMailTransport,
  ): () => void {
    const id = pluginMailIdSchema.parse(`plugin:${owner}:${key}`);
    const fields = mailFieldSchema.array().parse(definition.fields);
    if (new Set(fields.map((field) => field.key)).size !== fields.length)
      throw new Error(Errors.InvalidInput);
    const label = z.string().min(1).max(100).parse(definition.label);
    const release = this.register(
      id,
      {
        send: async (transport, message) => {
          if (transport.kind !== 'plugin') throw new Error(Errors.InvalidInput);
          this.validate(id, transport.settings);
          return definition.send({
            from: transport.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            settings: transport.settings,
          });
        },
      },
      this.timeoutMs,
    );
    const entry = { label, fields };
    this.plugins.set(id, entry);
    return () => {
      release();
      if (this.plugins.get(id) === entry) this.plugins.delete(id);
    };
  }

  available() {
    return structuredClone(
      [...this.plugins].map(([id, definition]) => ({ id, ...definition })),
    );
  }

  validate(id: string, values: MailValues) {
    const definition = this.plugins.get(id);
    if (!definition) throw new Error(Errors.EmailDisabled);
    if (
      Object.keys(values).some(
        (key) => !definition.fields.some((field) => field.key === key),
      )
    )
      throw new Error(Errors.InvalidInput);
    for (const field of definition.fields) {
      const value = values[field.key];
      if (value === undefined || value === '') {
        if (field.required) throw new Error(Errors.InvalidInput);
      } else if (
        typeof value !==
        (field.type === 'secret' || field.type === 'text'
          ? 'string'
          : field.type)
      )
        throw new Error(Errors.InvalidInput);
    }
    return definition.fields;
  }

  register(id: string, transport: Mailer, timeoutMs?: number): () => void {
    if (this.transports.has(id)) throw new Error(Errors.InvalidInput);
    const entry: Mailer =
      timeoutMs === undefined
        ? transport
        : {
            send: async (settings, message) => {
              const result = await isolate(
                () =>
                  transport.send(
                    structuredClone(settings),
                    structuredClone(message),
                  ),
                timeoutMs,
              );
              if (!result.ok || !z.void().safeParse(result.value).success)
                throw new Error(Errors.EmailSendFailed);
            },
          };
    this.transports.set(id, entry);
    return () => {
      if (this.transports.get(id) === entry) this.transports.delete(id);
    };
  }

  ids(): string[] {
    return [...this.transports.keys()];
  }

  async send(settings: MailTransport, message: EmailMessage): Promise<void> {
    const id =
      settings.kind === 'plugin'
        ? settings.id
        : settings.kind === 'smtp'
          ? 'smtp'
          : `http:${settings.provider}`;
    const transport = this.transports.get(id);
    if (!transport) throw new Error(Errors.EmailDisabled);
    await transport.send(settings, message);
  }
}
