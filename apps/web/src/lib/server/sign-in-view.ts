import { generate } from 'lean-qr';
import type { SignInDisplay, SignInField, SignInMethod } from '@cms/sdk';
import type { PendingStep } from '#lib/server/sso-cookie.js';

/** A QR code as one SVG path over a `size`×`size` grid (one unit per module). */
export interface QrCode {
  size: number;
  path: string;
}

/** What a step shows besides its fields, ready to render: QR codes are drawn on the server. */
export type DisplayView =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'qr'; qr: QrCode };

/** A field as the step's form renders it. */
export type FieldView = Pick<
  SignInField,
  'name' | 'label' | 'type' | 'autocomplete' | 'required'
> & {
  /** The method or factor that declared it, when known (core ones get catalog labels). */
  owner: string | null;
};

/**
 * A pending step as page data: never the API's transaction handle, only what the browser
 * needs to show it and to answer.
 */
export type StepView =
  | {
      kind: 'fields';
      fields: FieldView[];
      display: DisplayView[];
      message: string | null;
    }
  | {
      kind: 'webauthn';
      ceremony: 'get' | 'create';
      /** WebAuthn JSON options for `@simplewebauthn/browser`. */
      options: Record<string, unknown>;
      display: DisplayView[];
    }
  | {
      /** `secondFactor` completes one; `enroll` sets one up because the role requires it. */
      kind: 'factor';
      purpose: 'verify' | 'enroll';
      factors: { id: string; label: string }[];
    };

/** Runs of dark modules per row, so the path stays short. */
export const qrCode = (value: string): QrCode => {
  const code = generate(value);
  let path = '';
  for (let y = 0; y < code.size; y += 1) {
    let x = 0;
    while (x < code.size) {
      if (!code.get(x, y)) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < code.size && code.get(x, y)) x += 1;
      path += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return { size: code.size, path };
};

/** A value too long for any QR code is shown as text to copy instead. */
export const displayView = (display: SignInDisplay): DisplayView => {
  if (display.kind !== 'qr') return { kind: display.kind, text: display.text };
  try {
    return { kind: 'qr', qr: qrCode(display.value) };
  } catch {
    return { kind: 'code', text: display.value };
  }
};

/**
 * Where a `redirect` step may send the browser: an http(s) address with a readable expiry.
 * Anything else is null and the step is refused.
 */
export const redirectTarget = (step: { url: string; expiresAt: string }) => {
  if (!URL.canParse(step.url) || Number.isNaN(Date.parse(step.expiresAt)))
    return null;
  const { protocol } = new URL(step.url);
  return protocol === 'https:' || protocol === 'http:' ? step.url : null;
};

/**
 * Declared fields post as `field.<name>`, so a plugin's field name never collides with the
 * forms' own inputs (`method`, `option`, `token`, …). `SignInFields.svelte` uses the same.
 */
export const FIELD_PREFIX = 'field.';

const fieldView =
  (owner: string | null) =>
  ({ name, label, type, autocomplete, required }: SignInField): FieldView => ({
    name,
    label,
    type,
    ...(autocomplete !== undefined && { autocomplete }),
    required,
    owner,
  });

/** A method as the login or setup page offers it. */
export interface MethodView {
  id: string;
  label: string;
  options: { id: string; label: string }[];
  fields: FieldView[];
}

export const methodView = ({
  id,
  label,
  options,
  fields,
}: SignInMethod): MethodView => ({
  id,
  label,
  options: options.map((option) => ({ id: option.id, label: option.label })),
  fields: fields.map(fieldView(id)),
});

/** `owner`: the method or factor the step belongs to, when known. */
export const stepView = (
  step: PendingStep,
  owner: string | null = null,
): StepView => {
  switch (step.kind) {
    case 'fields':
      return {
        kind: 'fields',
        fields: step.fields.map(fieldView(owner)),
        display: step.display.map(displayView),
        message: step.message ?? null,
      };
    case 'webauthn':
      return {
        kind: 'webauthn',
        ceremony: step.ceremony,
        options: step.options,
        display: step.display.map(displayView),
      };
    case 'secondFactor':
    case 'enroll':
      return {
        kind: 'factor',
        purpose: step.kind === 'enroll' ? 'enroll' : 'verify',
        factors: step.factors.map(({ id, label }) => ({ id, label })),
      };
  }
};

/** The posted values of exactly the declared fields; nothing else reaches the API. */
export const fieldValues = (
  form: FormData,
  fields: readonly Pick<SignInField, 'name'>[],
): Record<string, string> =>
  Object.fromEntries(
    fields.map(({ name }) => {
      const value = form.get(FIELD_PREFIX + name);
      return [name, typeof value === 'string' ? value : ''];
    }),
  );

/** Values safe to show again after a refusal: never passwords or codes. */
export const echoValues = (
  values: Record<string, string>,
  fields: readonly Pick<SignInField, 'name' | 'type'>[],
): Record<string, string> =>
  Object.fromEntries(
    fields
      .filter(({ type }) => type === 'text' || type === 'email')
      .map(({ name }) => [name, values[name] ?? '']),
  );
