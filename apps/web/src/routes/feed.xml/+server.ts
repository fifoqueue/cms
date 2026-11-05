import { serveFeed } from '#web/routes/feed.xml/feed.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) => serveFeed(event);
