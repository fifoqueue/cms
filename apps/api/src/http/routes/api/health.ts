import { json } from '../../respond';
import type { ApiApp } from '../../services';

export const routes = (app: ApiApp) =>
  app.get('', () => json({ status: 'ok' }));
