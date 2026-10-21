import { json } from '../../../../respond';
import type { ApiApp } from '../../../../services';
import { session } from '../../../../session';

export const routes = (app: ApiApp) =>
  session(app).get('', ({ user }) => json(user));
