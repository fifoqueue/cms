import { rootDocument } from '#web/routes/[document].txt/document.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
  rootDocument(event, event.params.document, 'json');
