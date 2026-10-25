import type { AdminSignInSettings, SignInSettingsInput } from '@cms/sdk';

/** Settings → Sign-in as the form shows and posts it. */
export interface SignInFormValues {
  /** Every listed method, allowed or not, in login-page order. */
  order: string[];
  /** Allowed methods, in `order`. */
  methods: string[];
  secondFactors: string[];
  requireSecondFactor: string[];
}

/** The lists of the settings; issue paths start with one of them. */
export const SIGN_IN_LISTS = [
  'methods',
  'secondFactors',
  'requireSecondFactor',
] as const;

export type SignInList = (typeof SIGN_IN_LISTS)[number];

/** A method or factor row: registered ones carry their label and source; others only an id. */
export interface SignInRow {
  id: string;
  label: string;
  /** `core`, the providing plugin's id, or null when nothing provides it right now. */
  source: string | null;
  /** Methods only: whether it can sign anyone in now. */
  ready: boolean;
}

const unique = (items: string[]) => [...new Set(items)];

const strings = (form: FormData, name: string) =>
  form
    .getAll(name)
    .filter((value): value is string => typeof value === 'string' && !!value);

/** Saved settings as form values: allowed methods first, then the other registered ones. */
export const signInValues = (
  settings: Pick<
    AdminSignInSettings,
    'methods' | 'secondFactors' | 'requireSecondFactor' | 'available'
  >,
): SignInFormValues => ({
  order: unique([
    ...settings.methods,
    ...settings.available.methods.map(({ id }) => id),
  ]),
  methods: [...settings.methods],
  secondFactors: [...settings.secondFactors],
  requireSecondFactor: [...settings.requireSecondFactor],
});

/** The posted form. Checked methods follow the posted `order`; ids are read as untrusted text. */
export const readSignInForm = (form: FormData): SignInFormValues => {
  const order = unique(strings(form, 'order'));
  const allowed = new Set(strings(form, 'methods'));
  return {
    order,
    methods: order.filter((id) => allowed.has(id)),
    secondFactors: unique(strings(form, 'secondFactors')),
    requireSecondFactor: unique(strings(form, 'requireSecondFactor')),
  };
};

export const signInInput = (values: SignInFormValues): SignInSettingsInput => ({
  methods: values.methods,
  secondFactors: values.secondFactors,
  requireSecondFactor: values.requireSecondFactor,
});

/** `order` with the item at `index` moved one place up (-1) or down (1); unchanged at an end. */
export const moveItem = <T>(
  order: readonly T[],
  index: number,
  offset: -1 | 1,
) => {
  const target = index + offset;
  if (
    index < 0 ||
    index >= order.length ||
    target < 0 ||
    target >= order.length
  )
    return [...order];
  const moved = [...order];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
};

/** A `move` button's value, `<index>:up` or `<index>:down`. */
export const readMove = (value: string) => {
  const match = /^(\d+):(up|down)$/.exec(value);
  return match
    ? {
        index: Number(match[1]),
        offset: match[2] === 'up' ? (-1 as const) : (1 as const),
      }
    : null;
};

/** Method rows in form order, ids no plugin provides any more included (kept until removed). */
export const methodRows = (
  order: readonly string[],
  available: AdminSignInSettings['available']['methods'],
): SignInRow[] =>
  order.map((id) => {
    const method = available.find((entry) => entry.id === id);
    return method
      ? { id, label: method.label, source: method.source, ready: method.ready }
      : { id, label: id, source: null, ready: false };
  });

/**
 * Chosen factors in their saved order (the order sign-in offers them, kept by saving), then the
 * other registered ones. Chosen ids nothing provides right now stay listed.
 */
export const factorRows = (
  chosen: readonly string[],
  available: AdminSignInSettings['available']['secondFactors'],
): SignInRow[] =>
  unique([...chosen, ...available.map(({ id }) => id)]).map((id) => {
    const factor = available.find((entry) => entry.id === id);
    return factor
      ? { id, label: factor.label, source: factor.source, ready: true }
      : { id, label: id, source: null, ready: false };
  });

/**
 * Where an issue goes: `methods.2` → the method posted third, `methods` → the list itself;
 * null for an issue listed apart.
 */
export const signInIssueTarget = (
  path: string,
  values: SignInFormValues,
): { list: SignInList; id: string | null } | null => {
  const [root, index, ...rest] = path.split('.');
  if (!(SIGN_IN_LISTS as readonly string[]).includes(root ?? '')) return null;
  const list = root as SignInList;
  if (index === undefined) return { list, id: null };
  if (rest.length || !/^\d+$/.test(index)) return null;
  const id = values[list][Number(index)];
  return id === undefined ? null : { list, id };
};
