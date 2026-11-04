import type { EgressService } from '@cms/sdk';
import type { HookDispatcher } from '#api/domain/ports';
import { destinationBlocked } from '#api/shared/errors';
import { z } from 'zod';

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Only non-credential protocol and tracing headers cross the hook boundary. */
const headerName = z
  .string()
  .regex(
    /^(?:accept|accept-language|content-type|cache-control|if-modified-since|if-none-match|user-agent|traceparent|tracestate|x-request-id)$/i,
  );
const headersSchema = z
  .record(
    headerName,
    z
      .string()
      .max(4096)
      .regex(/^[^\r\n\0]*$/),
  )
  .refine((headers) => Object.keys(headers).length <= 32);

export const hookFetch =
  (
    hooks: HookDispatcher | undefined,
    service: EgressService,
    next: Fetch,
  ): Fetch =>
  async (input, init) => {
    const allowedHook = hooks?.has('http.requestAllowed');
    const requestHook = hooks?.has('http.request');
    const respondedHook = hooks?.has('http.responded');

    if (!allowedHook && !requestHook && !respondedHook)
      return next(input, init);

    const started = respondedHook ? performance.now() : 0;
    let host = '';
    let status: number | null = null;

    try {
      const source = input instanceof Request ? input : undefined;
      const url = new URL(source ? source.url : String(input));

      host = url.host;

      if (allowedHook) {
        const schema = z
          .object({
            service: z.literal(service),
            host: z.literal(host),
            allowed: z.boolean(),
          })
          .strict();
        const decision = await hooks!.applyFilter(
          'http.requestAllowed',
          { service, host, allowed: true },
          (value) => schema.safeParse(value).success,
        );

        if (!decision.allowed) throw destinationBlocked();
      }

      if (requestHook) {
        const method = init?.method ?? source?.method ?? 'GET';
        const headers = new Headers(init?.headers ?? source?.headers);
        const signed = headers
          .get('authorization')
          ?.startsWith('AWS4-HMAC-SHA256 ');
        const entries = [...headers].filter(
          ([name]) => headerName.safeParse(name).success,
        );
        const visible = Object.fromEntries(entries);
        const visibleNames = Object.keys(visible);
        const schema = z
          .object({
            service: z.literal(service),
            method: z.literal(method),
            url: z.literal(url.origin),
            headers: headersSchema,
          })
          .strict();
        const filtered = await hooks!.applyFilter(
          'http.request',
          { service, method, url: url.origin, headers: visible },
          (value) => {
            const parsed = schema.safeParse(value);

            if (!parsed.success) return false;
            if (!signed) return true;

            const candidate = new Headers(parsed.data.headers);

            return (
              [...candidate].length === entries.length &&
              entries.every(([name, value]) => candidate.get(name) === value)
            );
          },
        );

        if (!signed) {
          for (const name of visibleNames) headers.delete(name);
          for (const [name, value] of Object.entries(filtered.headers))
            headers.set(name, value);
          init = { ...init, headers };
        }
      }

      const response = await next(input, init);

      status = response.status;

      return response;
    } finally {
      if (respondedHook)
        await hooks!.emit('http.responded', {
          service,
          host,
          status,
          durationMs: Math.max(0, performance.now() - started),
        });
    }
  };
