import { loginSchema, passwordResetSchema } from '@cms/sdk';
import type { UserProfile } from '@cms/sdk';
import type {
  CoreSignInMethod,
  CoreSignInOutcome,
} from '#api/domain/auth/core-sign-in';
import type { PasswordHasher, UserRepository } from '#api/domain/auth/ports';
import type { CredentialRepository } from '#api/domain/auth/password-service';

export const createPasswordMethod = (deps: {
  users: UserRepository;
  hasher: PasswordHasher;
  credentials: CredentialRepository;
}): CoreSignInMethod => {
  let dummyHash: Promise<string> | undefined;
  const setup = async (
    user: UserProfile,
    values: Readonly<Record<string, string>>,
  ): Promise<CoreSignInOutcome> => {
    const parsed = passwordResetSchema.shape.password.safeParse(
      values.password,
    );
    if (!parsed.success) return { kind: 'failed' };
    const hash = await deps.hasher.hash(parsed.data);
    return {
      kind: 'user',
      userId: user.id,
      commitSetup: (tokenHash, now) =>
        deps.credentials.reset(tokenHash, now, hash),
    };
  };
  return {
    label: 'Password',
    fields: [
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        autocomplete: 'username',
        required: true,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        autocomplete: 'current-password',
        required: true,
      },
    ],
    usableBy: async (user) =>
      !!(await deps.users.findById(user.id))?.passwordHash,
    begin: async (request) => {
      const parsed = loginSchema.safeParse(request.values);
      if (!parsed.success) return { kind: 'failed' };
      const user = await deps.users.findByEmail(
        parsed.data.email.toLowerCase(),
      );
      const hash =
        user?.passwordHash ??
        (await (dummyHash ??= deps.hasher.hash('dummy-password')));
      const valid = await deps.hasher.verify(parsed.data.password, hash);
      return user && valid
        ? { kind: 'user', userId: user.id }
        : { kind: 'failed' };
    },
    setup: {
      fields: [
        {
          name: 'password',
          label: 'New password',
          type: 'password',
          autocomplete: 'new-password',
          required: true,
        },
      ],
      begin: (user, request) => setup(user, request.values),
      continue: (user, step) => setup(user, step.values),
    },
  };
};
