import { AsyncLocalStorage } from 'node:async_hooks';
import type { PageRender } from '@cms/sdk';
import type { WebHookBus } from '#lib/server/web-hooks.js';
import type { WebHeadTag } from '@cms/sdk/functions';

export interface RenderRequest {
  bus: WebHookBus;
  pending?: Promise<{ render: PageRender; head: WebHeadTag[] }>;
}

export const renderRequest = new AsyncLocalStorage<RenderRequest>();
