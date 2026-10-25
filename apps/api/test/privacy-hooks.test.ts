import { expect, test } from 'bun:test';
import type { PrivacyExportData, PrivacyRequest } from '@cms/sdk';
import { PrivacyService } from '#api/domain/privacy/privacy-service';
import type {
  PrivacyRecord,
  PrivacyRepository,
} from '#api/domain/privacy/ports';
import { HookBus } from '#api/plugin-runtime/hook-bus';
import {
  MemorySettings,
  fixedClock,
  recordingLogger,
  sequentialIds,
} from '#test/support/memory';

const actor = { id: 'admin', role: 'administrator' };
const fixture = () => {
  const hooks = new HookBus({
    timeoutMs: 10,
    logger: recordingLogger().logger,
  });
  const clock = fixedClock();
  const rows = new Map<string, PrivacyRecord>();
  const repository: PrivacyRepository = {
    insert: async (row) => {
      rows.set(row.id, row);
    },
    get: async (id) => rows.get(id) ?? null,
    list: async () => ({ items: [...rows.values()], total: rows.size }),
    confirm: async () => true,
    data: async (_email, section) =>
      section === 'profile' ? [{ id: 'subject', name: 'Person' }] : [],
    complete: async (id, now) => {
      Object.assign(rows.get(id)!, { status: 'completed', completedAt: now });
    },
    erase: async (id, _hash, now) => {
      Object.assign(rows.get(id)!, { status: 'completed', completedAt: now });
    },
  };
  const service = new PrivacyService({
    hooks,
    repository,
    clock,
    ids: sequentialIds(),
    settings: new MemorySettings(),
    published: { summariesByIds: async () => [] },
    email: { enabled: async () => true, queue: async () => {} },
    site: async () => ({
      title: 'Site',
      locale: 'en',
      siteUrl: 'https://example.com',
    }),
    signer: { sign: () => 'signature', verify: () => true },
    tokens: { issue: () => 'private-token', digest: () => 'private-digest' },
    hasher: { hash: async () => 'private-hash', verify: async () => false },
    protection: { check: async () => {} },
  });
  const create = async (action: 'export' | 'erase') => {
    const request = await service.create(
      { email: 'subject@example.com', action },
      actor,
      {
        client: null,
        address: null,
        captchaToken: null,
      },
    );
    Object.assign(rows.get(request.id)!, {
      status: 'confirmed',
      confirmedAt: clock.now(),
    });
    return request;
  };
  return { hooks, rows, repository, service, create };
};

test('privacy actions project request DTOs after persistence; export adds plugin JSON without replacing core', async () => {
  const { hooks, rows, service, create } = fixture();
  const events: { name: string; value: PrivacyRequest }[] = [];
  for (const name of [
    'privacy.requested',
    'privacy.exported',
    'privacy.erased',
  ] as const)
    hooks.registrar('test').on(name, (value) => {
      expect(rows.get(value.id)?.status).toBe(value.status);
      events.push({ name, value });
    });
  hooks.registrar('export').filter('privacy.exportData', (value) => {
    expect(value.request.email).toBe('subject@example.com');
    expect(value.request.status).toBe('confirmed');
    return {
      ...value,
      data: { ...value.data, preferences: { consent: true } },
    };
  });
  hooks.registrar('invalid').filter(
    'privacy.exportData',
    (value) =>
      ({
        ...value,
        data: { invalid: new Date() },
      }) as unknown as PrivacyExportData,
  );
  const request = await create('export');
  const data = await new Response(
    await service.export(request.id, actor),
  ).json();
  expect(data.profile).toEqual([{ id: 'subject', name: 'Person' }]);
  expect(data.extensions).toEqual({ preferences: { consent: true } });
  const erasure = await create('erase');
  await service.erase(erasure.id, actor);
  expect(events.map((event) => event.name)).toEqual([
    'privacy.requested',
    'privacy.exported',
    'privacy.requested',
    'privacy.erased',
  ]);
  expect(events[1]!.value.completedAt).not.toBeNull();
  expect(JSON.stringify(events)).not.toContain('private-');
  expect(JSON.stringify(events)).not.toContain('tokenHash');
});

test('failed export/erasure do not emit success; identity-changing export filters are ignored', async () => {
  const { hooks, service, repository, create } = fixture();
  const events: unknown[] = [];
  hooks.registrar('test').on('privacy.erased', (value) => {
    events.push(value);
  });
  hooks.registrar('test').on('privacy.exported', (value) => {
    events.push(value);
  });
  hooks.registrar('identity').filter('privacy.exportData', (value) => ({
    ...value,
    request: { ...value.request, email: 'another@example.com' },
    data: { wrong: true },
  }));
  const request = await create('export');
  const data = await new Response(
    await service.export(request.id, actor),
  ).json();
  expect(data.extensions).toEqual({});
  events.length = 0;
  repository.complete = async () => {
    throw new Error('commit failed');
  };
  await expect(
    new Response(await service.export(request.id, actor)).text(),
  ).rejects.toThrow('commit failed');
  const erasure = await create('erase');
  repository.erase = async () => {
    throw new Error('erase failed');
  };
  await expect(service.erase(erasure.id, actor)).rejects.toThrow(
    'erase failed',
  );
  expect(events).toEqual([]);
});
