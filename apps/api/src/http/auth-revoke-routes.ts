import type { Capability, UserProfile } from '@cms/sdk';
import { idParams } from '#api/http/params';
import { noContent } from '#api/http/respond';
import type { ApiApp, ApiServices } from '#api/http/services';
import { session } from '#api/http/session';

type RevokeContext = ApiServices & {
  user: UserProfile;
  params: { id: string };
};

/** `DELETE` of a session or credential by id; responds 204. */
export const revokeRoutes =
  (
    revoke: (context: RevokeContext) => Promise<unknown>,
    capability?: Capability,
  ) =>
  (app: ApiApp) =>
    session(app, capability).delete(
      '',
      async (context) => {
        await revoke(context);
        return noContent();
      },
      idParams,
    );
