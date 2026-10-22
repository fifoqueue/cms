import { adminFor } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { checks, info } = await adminFor(event).health();
  return {
    checks: checks.map(({ key, status, detail }) => ({ key, status, detail })),
    info: { cms: info.cms, runtime: info.runtime, database: info.database },
  };
};
