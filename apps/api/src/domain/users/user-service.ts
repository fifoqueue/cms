import {
  profileUpdateSchema,
  userCreateSchema,
  userDeleteSchema,
  userRoleSchema,
  userUpdateSchema,
  membershipSchema,
  registrationSchema,
  publicAuthorSchema,
  userSaveSchema,
  userQuerySchema,
} from '@cms/sdk';
import { can } from '@cms/sdk';
import type {
  AdminUserSummary,
  PublicAuthor,
  UserProfile,
  UserSave,
} from '@cms/sdk';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import type { RoleService } from '#api/domain/users/role-service';
import type { ProfileMeta } from '#api/domain/users/profile-meta';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type {
  PasswordHasher,
  TokenIssuer,
  UserRecord,
  UserRepository,
} from '#api/domain/auth/ports';
import { slugify, uniqueSlug } from '#api/domain/content/slug';
import type { Clock, HookDispatcher, IdGenerator } from '#api/domain/ports';
import type { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { toProfile } from '#api/domain/users/user-mapper';
import type {
  UserDirectory,
  UserListItem,
} from '#api/domain/users/user-directory';
import {
  DomainError,
  conflict,
  invalidInput,
  notFound,
  Errors,
} from '#api/shared/errors';
import { withParams } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface UserServiceDeps {
  profiles?: ProfileMeta;
  hooks?: HookDispatcher;
  roles?: RoleService;
  settings?: SettingsRepository;
  protection?: ProtectionService;
  users: UserRepository;
  directory: UserDirectory;
  hasher: PasswordHasher;
  tokens: Pick<TokenIssuer, 'issue'>;
  ids: IdGenerator;
  clock: Clock;
  sealedJobs: SealedJobs;
  /** Signed same-origin avatar URL for a public author key, or null. */
  avatar?: (key: string) => Promise<string | null>;
  /** Invitations by email to choose a password. */
  invitations: {
    /** Whether email delivery can send one now. */
    available(): Promise<boolean>;
    send(user: UserRecord): Promise<void>;
  };
}

const toSummary = (user: UserListItem): AdminUserSummary => ({
  id: user.id,
  email: user.email,
  name: user.name,
  slug: user.slug,
  bio: user.bio,
  role: user.role as AdminUserSummary['role'],
  createdAt: user.createdAt.toISOString(),
  contentCount: user.contentCount,
});

export const REGISTRATION_JOB = 'user.register';
const REGISTRATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const registrationJobSchema = registrationSchema.pick({
  email: true,
  name: true,
});

/** Accounts of the people who run the site. */
export class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  async list(actor: Actor): Promise<AdminUserSummary[]> {
    authorize(actor, 'users.manage');
    const query =
      (await this.deps.hooks?.applyFilter(
        'user.query',
        {},
        (value) => userQuerySchema.safeParse(value).success,
      )) ?? {};
    return (await this.deps.directory.list(userQuerySchema.parse(query))).map(
      toSummary,
    );
  }

  /** A public author archive; only users with published entries have one. */
  async publicAuthor(slug: string): Promise<PublicAuthor> {
    const author = await this.deps.directory.publicAuthor(slug);
    if (!author) throw notFound(Errors.UserNotFound);
    const result: PublicAuthor = {
      name: author.name,
      slug: author.slug,
      bio: author.bio,
      avatarUrl: (await this.deps.avatar?.(`author:${author.slug}`)) ?? null,
    };
    return publicAuthorSchema.parse(
      (await this.deps.hooks?.applyFilter(
        'user.public',
        result,
        (value) => publicAuthorSchema.strict().safeParse(value).success,
      )) ?? result,
    );
  }

  /** Id, name and public slug of every user who can write, for the author picker and filter. */
  async authors(): Promise<{ id: string; name: string; slug: string }[]> {
    const roles = await this.deps.roles?.list();
    return (await this.deps.directory.list())
      .filter((user) =>
        can(
          {
            role: user.role,
            capabilities: roles?.find((role) => role.key === user.role)
              ?.capabilities,
          },
          'content.create',
        ),
      )
      .map(({ id, name, slug }) => ({ id, name, slug }));
  }

  /** With a password the account is usable at once; without one the user is invited by email. */
  async create(input: unknown, actor: Actor): Promise<AdminUserSummary> {
    authorize(actor, 'users.manage');
    return this.createAccount(input);
  }

  private async createAccount(
    input: unknown,
    preparedHash?: string,
  ): Promise<AdminUserSummary> {
    const { password, ...fields } = parseInput(userCreateSchema, input);
    const filtered = await this.beforeSave({
      operation: 'create',
      id: null,
      data: fields,
    });
    // Public registration always creates subscribers, regardless of plugin input changes.
    const data = {
      ...filtered.data,
      role: preparedHash ? 'subscriber' : filtered.data.role,
      password,
    };
    await this.deps.roles?.require(data.role);
    const email = data.email.toLowerCase();
    if (!data.password && !(await this.deps.invitations.available()))
      throw invalidInput(Errors.PasswordRequired, [
        { path: 'password', message: Errors.PasswordRequired },
      ]);
    await this.assertEmailFree(email, null);
    const id = this.deps.ids.next();
    const user: UserRecord = {
      id,
      email,
      name: data.name,
      // An invited user cannot sign in until they choose a password.
      passwordHash:
        preparedHash ??
        (await this.deps.hasher.hash(
          data.password ?? this.deps.tokens.issue(),
        )),
      role: data.role,
      slug: data.slug ?? (await this.newSlug(data.name, id)),
      bio: '',
      locale: '',
      createdAt: this.deps.clock.now(),
    };
    if (data.slug) await this.assertSlugFree(data.slug);
    await this.deps.directory.insert(user);
    const summary = toSummary({ ...user, contentCount: 0 });
    void this.deps.hooks?.emit('user.created', summary);
    if (!data.password) await this.deps.invitations.send(user);
    return summary;
  }

  async membership() {
    const result = membershipSchema.safeParse(
      await this.deps.settings?.get('membership'),
    );
    return result.success ? result.data : { enabled: false };
  }

  async configureMembership(input: unknown, actor: Actor) {
    authorize(actor, 'users.manage');
    const settings = parseInput(membershipSchema, input);
    if (settings.enabled && !(await this.deps.invitations.available()))
      throw invalidInput(Errors.EmailDisabled);
    await this.deps.settings?.set('membership', settings);
    return settings;
  }

  /** Email possession is proved through the existing single-use password invitation. */
  async register(input: unknown, attempt: Omit<Attempt, 'action' | 'account'>) {
    const data = parseInput(registrationSchema, input);
    let allowed = (await this.membership()).enabled;
    if (!allowed) throw invalidInput(Errors.RegistrationClosed);
    await this.deps.protection?.check({
      ...attempt,
      action: 'passwordReset',
      account: data.email.toLowerCase(),
    });
    if (!(await this.deps.invitations.available()))
      throw invalidInput(Errors.EmailDisabled);
    await this.deps.hooks?.applyFilter(
      'user.registrationAllowed',
      allowed,
      (value) => {
        if (typeof value !== 'boolean' || (!allowed && value)) return false;
        allowed = value;
        return true;
      },
    );
    if (!allowed) throw invalidInput(Errors.RegistrationClosed);
    await this.deps.sealedJobs.enqueue(
      REGISTRATION_JOB,
      {
        email: data.email.toLowerCase(),
        name: data.name,
        subjects: [data.email.toLowerCase()],
      },
      new Date(this.deps.clock.now().getTime() + REGISTRATION_LIFETIME_MS),
    );
  }

  /** Creates the account after the public request has returned. */
  async completeRegistration(payload: unknown) {
    const data = this.deps.sealedJobs.open(payload, registrationJobSchema);
    const [existing, passwordHash] = await Promise.all([
      this.deps.users.findByEmail(data.email),
      this.deps.hasher.hash(this.deps.tokens.issue()),
    ]);
    if (existing) return;
    try {
      await this.createAccount({ ...data, role: 'subscriber' }, passwordHash);
    } catch (caught) {
      if (!(caught instanceof DomainError) || caught.code !== 'conflict')
        throw caught;
    }
  }

  /** Changes only the user's role; the profile stays as currently stored. */
  async setRole(id: string, input: unknown, actor: Actor): Promise<void> {
    authorize(actor, 'users.manage');
    const current = await this.require(id);
    const {
      data: { role },
    } = await this.beforeSave({
      operation: 'role',
      id,
      data: parseInput(userRoleSchema, input),
    });
    await this.deps.roles?.require(role);
    await this.deps.directory.setRole(id, role);
    if (current.role !== role)
      void this.deps.hooks?.emit('user.roleChanged', {
        user: toProfile({ ...current, role }),
        previousRole: current.role,
      });
  }

  async update(
    id: string,
    input: unknown,
    actor: Actor,
  ): Promise<AdminUserSummary> {
    authorize(actor, 'users.manage');
    const current = await this.require(id);
    const { data } = await this.beforeSave({
      operation: 'update',
      id,
      data: parseInput(userUpdateSchema, input),
    });
    await this.deps.roles?.require(data.role);
    const email = data.email.toLowerCase();
    await this.assertEmailFree(email, id);
    await this.assertSlugFree(data.slug, current.slug);
    await this.deps.directory.update({
      id,
      email,
      name: data.name,
      role: data.role,
      slug: data.slug,
      bio: data.bio,
      locale: current.locale,
    });
    const result = await this.summary(id);
    const profile = toProfile({ ...current, ...data, email });
    void this.deps.hooks?.emit('user.updated', profile);
    if (current.role !== data.role)
      void this.deps.hooks?.emit('user.roleChanged', {
        user: profile,
        previousRole: current.role,
      });
    return result;
  }

  async remove(id: string, input: unknown, actor: Actor): Promise<void> {
    authorize(actor, 'users.manage');
    if (id === actor.id) throw conflict(Errors.UserDeleteSelf);
    const current = await this.require(id);
    const { reassignTo } = parseInput(userDeleteSchema, input);
    if (
      reassignTo !== undefined &&
      (reassignTo === id || !(await this.deps.users.findById(reassignTo)))
    )
      throw invalidInput(Errors.ReassignTargetInvalid, [
        { path: 'reassignTo', message: Errors.ReassignTargetInvalid },
      ]);
    await this.deps.directory.delete(id, reassignTo ?? null);
    void this.deps.hooks?.emit('user.deleted', {
      user: toProfile(current),
      reassignTo: reassignTo ?? null,
    });
  }

  /** Changes the signed-in user's own profile; the role is never changed here. */
  async updateProfile(input: unknown, actor: Actor): Promise<UserProfile> {
    const current = await this.require(actor.id);
    const { data } = await this.beforeSave({
      operation: 'profile',
      id: actor.id,
      data: parseInput(profileUpdateSchema, input),
    });
    const email = data.email.toLowerCase();
    if (email !== current.email && !can(actor, 'users.manage'))
      throw invalidInput(Errors.EmailChangeRestricted, [
        { path: 'email', message: Errors.EmailChangeRestricted },
      ]);
    await this.assertEmailFree(email, current.id);
    await this.assertSlugFree(data.slug, current.slug);
    await this.deps.directory.updateProfile({
      id: current.id,
      email,
      name: data.name,
      slug: data.slug,
      bio: data.bio,
      locale: data.locale,
    });
    const profile = toProfile(await this.require(current.id));
    if (this.deps.roles)
      profile.capabilities = await this.deps.roles.capabilities(
        profile.role,
        profile.id,
      );
    void this.deps.hooks?.emit('user.updated', profile);
    return profile;
  }

  private async summary(id: string) {
    const user = await this.deps.directory.get(id);
    if (!user) throw notFound(Errors.UserNotFound);
    return toSummary(user);
  }

  async profileFields(id: string, actor: Actor) {
    if (id !== actor.id) authorize(actor, 'users.manage');
    await this.require(id);
    return this.deps.profiles?.get(id) ?? { fields: [], values: {} };
  }

  async saveProfileFields(id: string, input: unknown, actor: Actor) {
    if (id !== actor.id) authorize(actor, 'users.manage');
    const user = await this.require(id);
    if (!this.deps.profiles) throw invalidInput(Errors.UserNotFound);
    const result = await this.deps.profiles.save(id, input);
    void this.deps.hooks?.emit('user.updated', toProfile(user));
    return result;
  }

  private async beforeSave<T extends UserSave>(input: T): Promise<T> {
    const result =
      (await this.deps.hooks?.applyFilter('user.beforeSave', input, (value) => {
        const parsed = userSaveSchema.safeParse(value);
        return (
          parsed.success &&
          parsed.data.operation === input.operation &&
          parsed.data.id === input.id
        );
      })) ?? input;
    return userSaveSchema.parse(result) as T;
  }

  private async require(id: string) {
    const user = await this.deps.users.findById(id);
    if (!user) throw notFound(Errors.UserNotFound);
    return user;
  }

  private async assertEmailFree(email: string, exceptId: string | null) {
    const other = await this.deps.users.findByEmail(email);
    if (other && other.id !== exceptId) throw conflict(Errors.EmailRegistered);
  }

  /** `current` is the user's own slug, which stays theirs. */
  private async assertSlugFree(slug: string, current?: string) {
    if (slug === current) return;
    if ((await this.deps.users.takenSlugs([slug])).size)
      throw conflict(
        Errors.SlugInUse,
        withParams(Errors.SlugInUse, { slug }, 'slug'),
      );
  }

  private newSlug(name: string, id: string) {
    return uniqueSlug(
      slugify(name) || `user-${id.slice(-12)}`,
      (candidates) => this.deps.users.takenSlugs(candidates),
      () => this.deps.ids.next().slice(-8),
    );
  }
}
