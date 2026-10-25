import type { RateLimiter } from '#api/domain/ports';
import { discoveryFilterInputSchema } from '@cms/sdk/plugin';
import { parseInput } from '#api/shared/validation';
import type { SeoSettingsService } from '#api/domain/seo/seo-settings-service';
import type { ClientResolver } from '#api/http/client-identity';
import { UNVERIFIED_CLIENT } from '#api/http/client-identity';
import { readJson, JSON_BODY_BYTES } from '#api/http/request';
import { forbidden, rateLimited, Errors } from '#api/shared/errors';

/** Frontend-only presentation RPC. Authenticate and admit before reading a bounded stream. */
export class SeoFilterGateway {
  constructor(
    private readonly clients: ClientResolver,
    private readonly limiter: RateLimiter,
    private readonly seo: Pick<SeoSettingsService, 'filterOutput'>,
  ) {}

  async filter(request: Request) {
    const client = this.clients.resolve(request);
    if (client === UNVERIFIED_CLIENT) throw forbidden();
    if (!this.limiter.tryAcquire(client))
      throw rateLimited(Errors.TooManyAttempts);
    const input = await readJson(request, JSON_BODY_BYTES);
    if (Array.isArray(input)) {
      const batch = parseInput(
        discoveryFilterInputSchema.array().min(1).max(7),
        input,
      );
      return Promise.all(batch.map((entry) => this.seo.filterOutput(entry)));
    }
    return this.seo.filterOutput(input);
  }
}
