import { requireCapability } from '#lib/server/session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  requireCapability(locals, 'appearance.manage');
};
