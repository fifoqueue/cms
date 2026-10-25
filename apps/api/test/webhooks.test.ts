import { describe, expect, test } from 'bun:test';
import {
  PermanentJobError,
  RecoverableJobError,
} from '#api/domain/jobs/job-runner';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import type { SecretBox } from '#api/domain/ports';
import { WebhookService } from '#api/domain/webhooks/webhook-service';
import { aesSecretBox } from '#api/infra/secret-box';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  ADMIN,
  MemorySettings,
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';
import { MemoryJobQueue } from '#test/support/memory-jobs';
import { plainSecretBox } from '#test/support/memory-security';

const setup = (secrets: SecretBox = plainSecretBox) => {
  const jobs = new MemoryJobQueue();
  const settings = new MemorySettings();
  const clock = fixedClock();
  const sent: { url: string; secret: string; event: string; body: string }[] =
    [];
  let answer = 200;
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const webhooks = new WebhookService({
    hooks,
    settings,
    secrets,
    tokens: { issue: () => 'whsec-1' },
    sealedJobs: new SealedJobs(jobs, secrets),
    transport: {
      check: async () => {},
      send: async (delivery) => {
        sent.push(delivery);
        return answer;
      },
    },
    ids: sequentialIds(),
    clock,
  });
  webhooks.subscribe(hooks.core('core:webhooks'));
  return {
    jobs,
    sent,
    hooks,
    webhooks,
    settings,
    clock,
    answer: (status: number) => void (answer = status),
    payloads: () => [...jobs.rows.values()].map((row) => row.payload),
  };
};

describe('WebhookService', () => {
  test('CRUD and delivery actions are secret-free; payload filters reject non-JSON', async () => {
    const { webhooks, hooks, payloads, sent, answer } = setup();
    const events: { name: string; value: unknown }[] = [];
    const registrar = hooks.registrar('observer');
    for (const name of [
      'webhook.created',
      'webhook.updated',
      'webhook.deleted',
      'webhook.delivered',
      'webhook.failed',
    ] as const)
      registrar.on(name, (value) => {
        events.push({ name, value });
      });
    registrar.filter('webhook.payload', () => ({
      extra: 'ok',
      id: 'forged',
      event: 'forged',
      occurredAt: 'forged',
    }));
    registrar.filter('webhook.payload', () => ({ bad: undefined }));
    registrar.filter('webhook.payload', () => ({ large: 'x'.repeat(65_536) }));
    const input = { url: 'https://hooks.example/a', events: ['site.updated'] };
    const hook = await webhooks.create(input, ADMIN);
    await webhooks.update(hook.id, input, ADMIN);
    await webhooks.ping(hook.id, ADMIN);
    await webhooks.deliver(payloads()[0]);
    expect(JSON.parse(sent[0]!.body).data.extra).toBe('ok');
    expect(JSON.parse(sent[0]!.body).event).toBe('ping');
    expect(JSON.parse(sent[0]!.body).id).not.toBe('forged');
    expect(JSON.parse(sent[0]!.body).occurredAt).not.toBe('forged');
    answer(500);
    await expect(webhooks.deliver(payloads()[0])).rejects.toThrow();
    await webhooks.remove(hook.id, ADMIN);
    expect(events.map(({ name }) => name)).toEqual([
      'webhook.created',
      'webhook.updated',
      'webhook.delivered',
      'webhook.failed',
      'webhook.deleted',
    ]);
    expect(events[2]!.value).toMatchObject({ id: hook.id, status: 200 });
    expect(events[3]!.value).toMatchObject({ id: hook.id, status: 500 });
    expect(JSON.stringify(events)).not.toContain('whsec');
  });
  test('queues signed deliveries for subscribed, enabled webhooks only', async () => {
    const { webhooks, hooks, sent, payloads } = setup();
    const created = await webhooks.create(
      { url: 'https://hooks.example/a', events: ['site.updated'] },
      ADMIN,
    );
    // The secret is shown once and never listed.
    expect(created.secret).toBe('whsec-1');
    expect(JSON.stringify(await webhooks.list(ADMIN))).not.toContain('whsec');
    await webhooks.create(
      {
        url: 'https://hooks.example/off',
        events: ['site.updated'],
        enabled: false,
      },
      ADMIN,
    );
    expect(
      await webhooks
        .create(
          { url: 'http://hooks.example/plain', events: ['site.updated'] },
          ADMIN,
        )
        .catch((error: { code: string }) => error.code),
    ).toBe('invalid_input');

    await hooks.emit('site.updated', {
      title: 'S',
      description: '',
      locale: 'en',
      iconId: null,
      logoId: null,
      loginPath: '/login',
      showLogin: true,
    });
    await hooks.emit('media.deleted', {} as never);
    await Bun.sleep(5);
    expect(payloads()).toHaveLength(1);
    await webhooks.deliver(payloads()[0]);
    expect(sent).toEqual([
      expect.objectContaining({
        url: 'https://hooks.example/a',
        secret: 'whsec-1',
        event: 'site.updated',
      }),
    ]);
    expect(JSON.parse(sent[0]!.body)).toMatchObject({
      event: 'site.updated',
      data: { title: 'S' },
    });
    expect((await webhooks.list(ADMIN))[0]).toMatchObject({
      lastStatus: 200,
      lastError: null,
    });
  });

  test('client errors stop retries; server errors are retried', async () => {
    const { webhooks, answer, payloads } = setup();
    const hook = await webhooks.create(
      { url: 'https://hooks.example/a', events: ['site.updated'] },
      ADMIN,
    );
    await webhooks.ping(hook.id, ADMIN);
    const [delivery] = payloads();
    answer(404);
    expect(
      await webhooks.deliver(delivery).catch((error: unknown) => error),
    ).toBeInstanceOf(PermanentJobError);
    answer(503);
    const retry = await webhooks
      .deliver(delivery)
      .catch((error: unknown) => error);
    expect(retry).toBeInstanceOf(Error);
    expect(retry).not.toBeInstanceOf(PermanentJobError);
    expect((await webhooks.list(ADMIN))[0]).toMatchObject({
      lastStatus: 503,
      lastError: 'The receiver answered HTTP 503',
    });
  });

  test('an unreadable encrypted delivery remains recoverable', async () => {
    const correct = aesSecretBox('webhook-job-key');
    const wrong = aesSecretBox('wrong-webhook-job-key');
    const { webhooks, jobs, settings, clock, payloads } = setup(correct);
    const hook = await webhooks.create(
      { url: 'https://hooks.example/a', events: ['site.updated'] },
      ADMIN,
    );
    await webhooks.ping(hook.id, ADMIN);
    const reader = new WebhookService({
      settings,
      secrets: wrong,
      tokens: { issue: () => 'unused' },
      sealedJobs: new SealedJobs(jobs, wrong),
      transport: { check: async () => {}, send: async () => 200 },
      ids: sequentialIds(),
      clock,
    });

    expect(
      await reader.deliver(payloads()[0]).catch((error: unknown) => error),
    ).toBeInstanceOf(RecoverableJobError);
  });
});
