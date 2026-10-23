import type { EgressRule, EgressService } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor, requireCapability } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

const lines = (rules: readonly EgressRule[]) =>
  rules
    .map(
      ({ service, host, port, addresses }) =>
        `${service} ${host} ${port} ${addresses.join(',')}`,
    )
    .join('\n');

const parseRules = (value: string): EgressRule[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [service, host = '', port = '', addresses = ''] = line.split(/\s+/);
      return {
        service: service as EgressService,
        host,
        port: Number(port),
        addresses: addresses.split(',').filter(Boolean),
      };
    });

export const load: PageServerLoad = async (event) => {
  requireCapability(event.locals, 'egress.manage');
  const settings = await adminFor(event).egress.settings();
  return {
    rules: lines(settings.rules),
    environmentRules: lines(settings.environmentRules),
  };
};

export const actions: Actions = {
  default: async (event) => {
    requireCapability(event.locals, 'egress.manage');
    const form = await event.request.formData();
    const rules = text(form, 'rules');
    try {
      await adminFor(event).egress.update({ rules: parseRules(rules) });
    } catch (caught) {
      return failFrom(caught, { rules });
    }
    return { notice: 'saved' };
  },
};
