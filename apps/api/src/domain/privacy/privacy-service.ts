import {
  privacyInputSchema,
  privacyConfirmationSchema,
  privacySettingsSchema,
  privacyRequestSchema,
  stringifyJson,
  privacyExportDataSchema,
} from '@cms/sdk';
import type { PrivacyAction, PublicPrivacy } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { TokenIssuer, PasswordHasher } from '#api/domain/auth/ports';
import type {
  Clock,
  HookDispatcher,
  IdGenerator,
  Signer,
} from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { PublishedContentRepository } from '#api/domain/content/published-content-repository';
import type { EmailService } from '#api/domain/email/email-service';
import { templates } from '#api/domain/email/templates';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import { PERSONAL_SECTIONS } from '#api/domain/privacy/ports';
import type {
  PrivacyRecord,
  PrivacyRepository,
} from '#api/domain/privacy/ports';
import { readable } from '#api/shared/stream';
import { parseInput } from '#api/shared/validation';
import { invalidInput, notFound, Errors } from '#api/shared/errors';
import type { EraserRegistry } from '#api/domain/privacy/eraser-registry';

const view = (row: PrivacyRecord) =>
  privacyRequestSchema.parse({
    id: row.id,
    email: row.email,
    action: row.action,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  });
export class PrivacyService {
  constructor(
    private readonly deps: {
      hooks?: HookDispatcher;
      erasers?: Pick<EraserRegistry, 'erase'>;
      repository: PrivacyRepository;
      settings: SettingsRepository;
      published: Pick<PublishedContentRepository, 'summariesByIds'>;
      email: Pick<EmailService, 'queue' | 'enabled'>;
      site: () => Promise<{ title: string; locale: string; siteUrl: string }>;
      signer: Signer;
      tokens: TokenIssuer;
      hasher: PasswordHasher;
      ids: IdGenerator;
      clock: Clock;
      protection: Pick<ProtectionService, 'check'>;
    },
  ) {}
  async settings() {
    const result = privacySettingsSchema.safeParse(
      (await this.deps.settings.get('privacy')) ?? {},
    );
    return result.success
      ? result.data
      : { policyPageId: null, commentCookies: false };
  }
  async update(input: unknown, actor: Actor) {
    authorize(actor, 'settings.manage');
    const settings = parseInput(privacySettingsSchema, input);
    if (settings.policyPageId) {
      const [page] = await this.deps.published.summariesByIds([
        settings.policyPageId,
      ]);
      if (!page || page.type !== 'page' || page.protected)
        throw invalidInput(Errors.PrivacyPolicyInvalid);
    }
    await this.deps.settings.set('privacy', settings);
    return settings;
  }
  async publicSettings(): Promise<PublicPrivacy> {
    const settings = await this.settings();
    const [page] = settings.policyPageId
      ? await this.deps.published.summariesByIds([settings.policyPageId])
      : [];
    return {
      policy:
        page && page.type === 'page' && !page.protected
          ? { title: page.title, path: page.path }
          : null,
      commentCookies: settings.commentCookies,
    };
  }
  async list(action: PrivacyAction, page: number, actor: Actor) {
    authorize(actor, 'users.manage');
    const result = await this.deps.repository.list(
      action,
      Math.max(1, Math.min(10000, page)),
    );
    return {
      items: result.items.map(view),
      total: result.total,
      page,
      pageSize: 20,
    };
  }
  async create(input: unknown, actor: Actor, attempt: Omit<Attempt, 'action'>) {
    authorize(actor, 'users.manage');
    const data = parseInput(privacyInputSchema, input);
    await this.deps.protection.check({
      ...attempt,
      action: 'privacy',
      account: data.email,
    });
    const site = await this.deps.site();
    if (!site.siteUrl) throw invalidInput(Errors.SiteUrlRequired);
    if (!(await this.deps.email.enabled()))
      throw invalidInput(Errors.EmailDisabled);
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + 2 * 86400000);
    const id = this.deps.ids.next();
    const payload = `${id}.${expiresAt.getTime()}.${this.deps.tokens.issue()}`;
    const token = `${payload}.${this.deps.signer.sign(`privacy:${payload}`)}`;
    const row: PrivacyRecord = {
      ...data,
      id,
      tokenHash: this.deps.tokens.digest(token),
      status: 'pending',
      createdAt: now,
      expiresAt,
      confirmedAt: null,
      completedAt: null,
    };
    await this.deps.repository.insert(row);
    void this.deps.hooks?.emit('privacy.requested', view(row));
    await this.deps.email.queue(
      {
        to: data.email,
        sensitive: true,
        subjects: [data.email],
        ...templates(site.locale).privacy(
          site.title,
          data.action,
          `${site.siteUrl}/privacy/confirm?token=${encodeURIComponent(token)}`,
        ),
      },
      expiresAt,
    );
    return view(row);
  }
  async confirm(input: unknown, attempt: Omit<Attempt, 'action'>) {
    await this.deps.protection.check({ ...attempt, action: 'privacy' });
    const { token } = parseInput(privacyConfirmationSchema, input);
    const [id, expires, nonce, signature, extra] = token.split('.');
    const now = this.deps.clock.now();
    if (
      !id ||
      !nonce ||
      !signature ||
      extra !== undefined ||
      !Number.isSafeInteger(Number(expires)) ||
      Number(expires) <= now.getTime() ||
      !this.deps.signer.verify(
        `privacy:${id}.${expires}.${nonce}`,
        signature,
      ) ||
      !(await this.deps.repository.confirm(
        id,
        this.deps.tokens.digest(token),
        now,
      ))
    )
      throw invalidInput(Errors.PrivacyConfirmationInvalid);
  }
  async export(id: string, actor: Actor) {
    const row = await this.ready(id, 'export', actor);
    const repository = this.deps.repository;
    const clock = this.deps.clock;
    const hooks = this.deps.hooks;
    async function* chunks() {
      yield `{"email":${JSON.stringify(row.email)}`;
      for (const section of PERSONAL_SECTIONS) {
        yield `,${JSON.stringify(section)}:[`;
        let after: string | null = null;
        let comma = false;
        for (;;) {
          const records = await repository.data(row.email, section, after, 200);
          for (const record of records) {
            yield `${comma ? ',' : ''}${stringifyJson(record)}`;
            comma = true;
          }
          if (records.length < 200) break;
          after = String(records.at(-1)!.id);
        }
        yield ']';
      }
      const request = view(row);
      const extra = (await hooks?.applyFilter(
        'privacy.exportData',
        { request, data: {} },
        (value) => {
          const parsed = privacyExportDataSchema.safeParse(value);
          return (
            parsed.success &&
            JSON.stringify(parsed.data.request) === JSON.stringify(request)
          );
        },
      )) ?? { request, data: {} };
      yield `,"extensions":${stringifyJson(extra.data)}}`;
      const completedAt = clock.now();
      await repository.complete(row.id, completedAt);
      void hooks?.emit(
        'privacy.exported',
        view({ ...row, status: 'completed', completedAt }),
      );
    }
    return readable(chunks());
  }
  async erase(id: string, actor: Actor) {
    const row = await this.ready(id, 'erase', actor);
    const completedAt = this.deps.clock.now();
    const report = this.deps.erasers
      ? await this.deps.erasers.erase(view(row))
      : await this.deps.repository
          .erase(
            id,
            await this.deps.hasher.hash(this.deps.tokens.issue()),
            completedAt,
          )
          .then(() => ({ results: {}, failed: [] }));
    void this.deps.hooks?.emit(
      'privacy.erased',
      view({ ...row, status: 'completed', completedAt }),
    );
    return report;
  }
  private async ready(id: string, action: PrivacyAction, actor: Actor) {
    authorize(actor, 'users.manage');
    const row = await this.deps.repository.get(id);
    if (!row || row.action !== action)
      throw notFound(Errors.PrivacyRequestMissing);
    if (
      row.status !== 'confirmed' &&
      !(action === 'export' && row.status === 'completed')
    )
      throw invalidInput(Errors.PrivacyNotConfirmed);
    return row;
  }
}
