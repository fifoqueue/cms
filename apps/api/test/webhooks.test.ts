import { describe, expect, test } from 'bun:test';
import { PermanentJobError } from '#api/domain/jobs/job-runner';
import { WebhookService } from '#api/domain/webhooks/webhook-service';
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

const setup = () => {
  const jobs = new MemoryJobQueue();
  const sent: { url: string; secret: string; event: string; body: string }[] =
    [];
  let answer = 200;
  const hooks = new HookBus({
    timeoutMs: 50,
    logger: recordingLogger().logger,
  });
  const webhooks = new WebhookService({
    settings: new MemorySettings(),
    secrets: plainSecretBox,
    tokens: { issue: () => 'whsec-1' },
    jobs,
    transport: {
      send: async (delivery) => {
        sent.push(delivery);
        return answer;
      },
    },
    ids: sequentialIds(),
    clock: fixedClock(),
  });
  webhooks.subscribe(hooks.registrar('core:webhooks'));
  return {
    jobs,
    sent,
    hooks,
    webhooks,
    answer: (status: number) => void (answer = status),
    payloads: () => [...jobs.rows.values()].map((row) => row.payload),
  };
};

describe('WebhookService', () => {
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
});
