import {
  COLOR_MODE_COOKIE,
  COLOR_MODE_DEPENDENCY,
  colorModeOf,
} from '#lib/admin/color-mode.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, depends }) => {
  depends(COLOR_MODE_DEPENDENCY);
  return { colorMode: colorModeOf(cookies.get(COLOR_MODE_COOKIE)) };
};
