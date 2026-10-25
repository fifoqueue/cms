import { adminFor } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { checks, info } = await adminFor(event).health();
  return {
    checks: checks.map(({ key, status, detail }) => ({
      key,
      status,
      // Notes keep only their catalog message and bounded params.
      detail: detail.map((line) =>
        typeof line === 'string'
          ? line
          : {
              message: line.message,
              ...(line.params && { params: { ...line.params } }),
            },
      ),
    })),
    info: { cms: info.cms, runtime: info.runtime, database: info.database },
  };
};
