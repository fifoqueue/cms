import type { Awaitable, UserProfile, SignInField } from '@cms/sdk';
import type {
  SignInMethodDefinition,
  SignInOutcome,
  SignInRequest,
  SignInContinuation,
} from '@cms/sdk/plugin';

/** Core-only finalizer: commits the credential change and token consumption atomically. */
export type CoreSignInOutcome =
  | SignInOutcome
  | {
      kind: 'user';
      userId: string;
      identityId?: string | null;
      commitSetup?(tokenHash: string, now: Date): Promise<boolean>;
    };

export interface CoreSignInMethod extends Omit<
  SignInMethodDefinition,
  'begin' | 'continue' | 'setup'
> {
  begin(request: SignInRequest): Awaitable<CoreSignInOutcome>;
  continue?(step: SignInContinuation): Awaitable<CoreSignInOutcome>;
  setup?: {
    fields?: SignInField[];
    begin(
      user: UserProfile,
      request: SignInRequest,
    ): Awaitable<CoreSignInOutcome>;
    continue?(
      user: UserProfile,
      step: SignInContinuation,
    ): Awaitable<CoreSignInOutcome>;
  };
}
