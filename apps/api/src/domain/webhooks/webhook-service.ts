import { WEBHOOK_EVENTS, webhookInputSchema } from '@cms/sdk';
import type { AdminWebhook, WebhookEvent, WebhookWithSecret } from '@cms/sdk';
import type { HookRegistrar } from '@cms/sdk/plugin';
import { z } from 'zod';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { TokenIssuer } from '#api/domain/auth/ports';
import { PermanentJobError } from '#api/domain/jobs/job-runner';
import type { JobQueue } from '#api/domain/jobs/ports';
import type { Clock, IdGenerator, SecretBox } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { notFound, messageOf, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const KEY = 'webhooks';
const STATUS_KEY = 'webhooks.status';
/** Job kind of one delivery. */
export const WEBHOOK_JOB = 'webhook.deliver';

interface StoredWebhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  /** Sealed signing secret. */
  secret: string;
}

interface DeliveryStatus {
  lastStatus: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
}

const deliverySchema = z.object({
  webhookId: z.string(),
  deliveryId: z.string(),
  event: z.string(),
  occurredAt: z.string(),
  data: z.unknown(),
});

/** Sends one signed delivery; resolves with the receiver's HTTP status. */
export interface WebhookTransport {
  /** Resolves and checks the configured destination without sending a delivery. */
  check(url: string): Promise<void>;
  send(delivery: {
    url: string;
    secret: string;
    event: string;
    deliveryId: string;
    body: string;
  }): Promise<number>;
}

/**
 * Webhooks: signed HTTP notifications of core events, queued as jobs so slow or failing
 * receivers never delay the request that caused the event, and retried with backoff.
 */
export class WebhookService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      secrets: SecretBox;
      tokens: Pick<TokenIssuer, 'issue'>;
      jobs: JobQueue;
      transport: WebhookTransport;
      ids: IdGenerator;
      clock: Clock;
    },
  ) {}

  /** Queues a delivery for every enabled webhook subscribed to each core event. */
  subscribe(hooks: HookRegistrar) {
    for (const event of WEBHOOK_EVENTS)
      hooks.on(event, (data) => this.queue(event, data));
  }

  async list(actor: Actor): Promise<AdminWebhook[]> {
    authorize(actor, 'tools.manage');
    const [hooks, status] = await Promise.all([this.stored(), this.status()]);
    return hooks.map((hook) => this.toAdmin(hook, status[hook.id]));
  }

  async create(input: unknown, actor: Actor): Promise<WebhookWithSecret> {
    authorize(actor, 'tools.manage');
    const data = parseInput(webhookInputSchema, input);
    if (data.enabled) await this.deps.transport.check(data.url);
    const secret = this.deps.tokens.issue();
    const hook: StoredWebhook = {
      ...data,
      id: this.deps.ids.next(),
      secret: this.deps.secrets.seal(secret),
    };
    await this.save([...(await this.stored()), hook]);
    return { ...this.toAdmin(hook), secret };
  }

  async update(id: string, input: unknown, actor: Actor) {
    authorize(actor, 'tools.manage');
    const data = parseInput(webhookInputSchema, input);
    if (data.enabled) await this.deps.transport.check(data.url);
    const hooks = await this.stored();
    const hook = hooks.find((candidate) => candidate.id === id);
    if (!hook) throw notFound(Errors.WebhookNotFound);
    Object.assign(hook, data);
    await this.save(hooks);
    return this.toAdmin(hook, (await this.status())[id]);
  }

  /** Replaces the signing secret; the new one is shown once. */
  async rotate(id: string, actor: Actor): Promise<WebhookWithSecret> {
    authorize(actor, 'tools.manage');
    const hooks = await this.stored();
    const hook = hooks.find((candidate) => candidate.id === id);
    if (!hook) throw notFound(Errors.WebhookNotFound);
    const secret = this.deps.tokens.issue();
    hook.secret = this.deps.secrets.seal(secret);
    await this.save(hooks);
    return { ...this.toAdmin(hook, (await this.status())[id]), secret };
  }

  async remove(id: string, actor: Actor) {
    authorize(actor, 'tools.manage');
    const hooks = await this.stored();
    if (!hooks.some((hook) => hook.id === id))
      throw notFound(Errors.WebhookNotFound);
    await this.save(hooks.filter((hook) => hook.id !== id));
  }

  /** Queues a `ping` delivery to check the receiver. */
  async ping(id: string, actor: Actor) {
    authorize(actor, 'tools.manage');
    const hook = (await this.stored()).find((candidate) => candidate.id === id);
    if (!hook) throw notFound(Errors.WebhookNotFound);
    await this.deps.transport.check(hook.url);
    await this.enqueue(hook, 'ping', { webhookId: id });
  }

  /** The job handler for `WEBHOOK_JOB`. 4xx answers (other than 408 and 429) are not retried. */
  async deliver(payload: unknown): Promise<void> {
    const delivery = deliverySchema.safeParse(payload);
    if (!delivery.success)
      throw new PermanentJobError(Errors.WebhookInvalidJob);
    const { webhookId, deliveryId, event, occurredAt, data } = delivery.data;
    const hook = (await this.stored()).find(
      (candidate) => candidate.id === webhookId,
    );
    // Deleted or switched off meanwhile: nothing to send (pings still check the receiver).
    if (!hook || (!hook.enabled && event !== 'ping')) return;
    const secret = this.deps.secrets.open(hook.secret);
    if (!secret) throw new PermanentJobError(Errors.WebhookSecretUnreadable);
    const at = this.deps.clock.now().toISOString();
    let status: number;
    try {
      status = await this.deps.transport.send({
        url: hook.url,
        secret,
        event,
        deliveryId,
        body: JSON.stringify({ id: deliveryId, event, occurredAt, data }),
      });
    } catch (error) {
      await this.record(hook.id, {
        lastStatus: null,
        lastError: messageOf(error).slice(0, 300),
        lastAttemptAt: at,
      });
      throw error;
    }
    const ok = status >= 200 && status < 300;
    await this.record(hook.id, {
      lastStatus: status,
      lastError: ok ? null : Errors.WebhookStatus(status),
      lastAttemptAt: at,
    });
    if (ok) return;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429)
      throw new PermanentJobError(Errors.WebhookStatus(status));
    throw new Error(Errors.WebhookStatus(status));
  }

  private async queue(event: WebhookEvent, data: unknown) {
    for (const hook of await this.stored())
      if (hook.enabled && hook.events.includes(event))
        await this.enqueue(hook, event, data);
  }

  private enqueue(hook: StoredWebhook, event: string, data: unknown) {
    return this.deps.jobs.enqueue(WEBHOOK_JOB, {
      webhookId: hook.id,
      deliveryId: this.deps.ids.next(),
      event,
      occurredAt: this.deps.clock.now().toISOString(),
      data,
    });
  }

  private toAdmin(
    hook: StoredWebhook,
    status: DeliveryStatus = {
      lastStatus: null,
      lastError: null,
      lastAttemptAt: null,
    },
  ): AdminWebhook {
    return {
      id: hook.id,
      url: hook.url,
      events: [...hook.events],
      enabled: hook.enabled,
      ...status,
    };
  }

  private async stored(): Promise<StoredWebhook[]> {
    const raw = await this.deps.settings.get(KEY);
    return Array.isArray(raw) ? (raw as StoredWebhook[]) : [];
  }

  private save(hooks: StoredWebhook[]) {
    return this.deps.settings.set(KEY, hooks);
  }

  private async status(): Promise<Record<string, DeliveryStatus>> {
    const raw = await this.deps.settings.get(STATUS_KEY);
    return typeof raw === 'object' && raw !== null
      ? (raw as Record<string, DeliveryStatus>)
      : {};
  }

  private async record(id: string, status: DeliveryStatus) {
    await this.deps.settings.set(STATUS_KEY, {
      ...(await this.status()),
      [id]: status,
    });
  }
}
