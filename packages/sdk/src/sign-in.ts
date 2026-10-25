import { z } from 'zod';
import { roleSchema, sessionGrantSchema } from '#sdk/auth';
import { Errors } from '#sdk/errors';

/**
 * Sign-in is a registry of methods and second factors, the same for core and plugins: core
 * registers `password`, `passkey` and `sso` (and the factors below) through the contract plugins
 * use (`AuthenticationRegistrar` in `@cms/sdk/plugin`). Administrators choose which ones are
 * allowed in Settings → Sign-in.
 */
export const CORE_SIGN_IN_METHODS = ['password', 'passkey', 'sso'] as const;
/** Second factors core provides. TOTP is never a primary method. */
export const CORE_SECOND_FACTORS = [
  'totp',
  'passkey',
  'recovery-code',
] as const;
/** Ids of plugin methods and factors: `plugin:<plugin id>:<key>`. */
export const PLUGIN_AUTH_ID = /^plugin:[a-z0-9-]{1,64}:[a-z0-9-]{1,64}$/;

export const signInMethodIdSchema = z.union([
  z.enum(CORE_SIGN_IN_METHODS),
  z.string().regex(PLUGIN_AUTH_ID),
]);
export const secondFactorIdSchema = z.union([
  z.enum(CORE_SECOND_FACTORS),
  z.string().regex(PLUGIN_AUTH_ID),
]);

const label = z.string().trim().min(1).max(100);
const transaction = z.string().min(1).max(256);

/** A field a sign-in step asks for. Values always arrive as strings. */
export const signInFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/),
  label,
  type: z.enum(['text', 'email', 'password', 'code']),
  autocomplete: z.string().max(64).optional(),
  required: z.boolean().default(true),
});

export type SignInField = z.output<typeof signInFieldSchema>;

/** Something a step shows besides its fields, e.g. a TOTP secret and its QR code. */
export const signInDisplaySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().max(2000) }),
  /** Monospaced, copyable (a secret to type into an app). */
  z.object({ kind: z.literal('code'), text: z.string().max(500) }),
  /** Rendered as a QR code (an `otpauth://` URI). */
  z.object({ kind: z.literal('qr'), value: z.string().max(2000) }),
]);

export type SignInDisplay = z.output<typeof signInDisplaySchema>;

const choice = z.object({ id: z.string().min(1).max(64), label });

/** A method as the login page shows it. */
export const signInMethodSchema = z.object({
  id: signInMethodIdSchema,
  label,
  /** Buttons that start the method, e.g. one per SSO provider. Empty: one button, or the form. */
  options: z.array(choice).max(20),
  /** Fields of the first step, shown as a form. Empty for button-only methods. */
  fields: z.array(signInFieldSchema).max(10),
});

export type SignInMethod = z.output<typeof signInMethodSchema>;

/** What the public login page offers. */
export const signInInfoSchema = z.object({
  /** Allowed methods that can sign someone in right now, in the configured order. */
  methods: z.array(signInMethodSchema),
  /** Methods that can set up an account from an emailed invitation or reset link. */
  setup: z.array(signInMethodSchema),
  /** Whether the public "forgot password" request is accepted (password sign-in is allowed). */
  passwordReset: z.boolean(),
});

export type SignInInfo = z.output<typeof signInInfoSchema>;

/** A second factor offered to finish (or, when required, to set up during) a sign-in. */
export const secondFactorChoiceSchema = choice.extend({
  id: secondFactorIdSchema,
});

/**
 * The next step of a sign-in, setup or enrollment. Keep `transaction` server-side (an
 * httpOnly cookie in the web app) and send it back with `continue`.
 */
export const signInStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), session: sessionGrantSchema }),
  /** Enrollment from the account page finished; there is no new session. */
  z.object({ kind: z.literal('done') }),
  /** Send the browser to `url`; the callback continues with the query it receives. */
  z.object({
    kind: z.literal('redirect'),
    url: z.url({ protocol: /^https?$/ }),
    transaction,
    expiresAt: z.iso.datetime(),
  }),
  /** Run `navigator.credentials.get` / `.create` with `options` (WebAuthn JSON), then continue. */
  z.object({
    kind: z.literal('webauthn'),
    ceremony: z.enum(['get', 'create']),
    options: z.record(z.string(), z.unknown()),
    display: z.array(signInDisplaySchema).max(10),
    transaction,
  }),
  /** Ask for more fields, then continue. */
  z.object({
    kind: z.literal('fields'),
    fields: z.array(signInFieldSchema).min(1).max(10),
    display: z.array(signInDisplaySchema).max(10),
    message: z.string().max(500).optional(),
    transaction,
  }),
  /** The first factor succeeded; choose a second factor (`chooseFactor`). */
  z.object({
    kind: z.literal('secondFactor'),
    factors: z.array(secondFactorChoiceSchema).min(1),
    transaction,
  }),
  /** A second factor is required but none is set up; choose one to enroll (`chooseFactor`). */
  z.object({
    kind: z.literal('enroll'),
    factors: z.array(secondFactorChoiceSchema).min(1),
    transaction,
  }),
]);

export type SignInStep = z.output<typeof signInStepSchema>;

export const signInStartSchema = z.object({
  option: z.string().min(1).max(64).optional(),
  values: z.record(z.string(), z.string().max(2000)).default({}),
});

export type SignInStartInput = z.input<typeof signInStartSchema>;

/** Sets up a method for the user of an emailed invitation or reset link (`token`). */
export const signInSetupSchema = signInStartSchema.extend({
  token: z.string().min(1).max(256),
});

export type SignInSetupInput = z.input<typeof signInSetupSchema>;

export const signInContinueSchema = z.object({
  transaction,
  values: z.record(z.string(), z.string().max(2000)).default({}),
  /** `PublicKeyCredential.toJSON()` from the WebAuthn ceremony. */
  credential: z.record(z.string(), z.unknown()).optional(),
  /** The query string an identity provider appended to the callback URL. */
  query: z.string().max(8192).optional(),
});

export type SignInContinueInput = z.input<typeof signInContinueSchema>;

export const chooseFactorSchema = z.object({
  transaction,
  factor: secondFactorIdSchema,
});

export type ChooseFactorInput = z.input<typeof chooseFactorSchema>;

/** The signed-in user's second factors (account page). */
export const userFactorsSchema = z.object({
  factors: z.array(
    secondFactorChoiceSchema.extend({
      enrolled: z.boolean(),
      /** Individual credentials, e.g. each passkey; empty when the factor has none to list. */
      credentials: z.array(
        z.object({
          id: z.string().min(1).max(128),
          label: z.string().max(100),
          createdAt: z.string().nullable(),
        }),
      ),
      /** Whether it can be set up from the account page. */
      enrollable: z.boolean(),
    }),
  ),
  /** The user's role must complete a second factor. */
  required: z.boolean(),
});

export type UserFactors = z.output<typeof userFactorsSchema>;

const unique = <T extends string>(items: T[], ctx: z.RefinementCtx) => {
  items.forEach((item, index) => {
    if (items.indexOf(item) !== index)
      ctx.addIssue({
        code: 'custom',
        message: Errors.SignInDuplicate,
        path: [index],
      });
  });
};

/** Settings → Sign-in. Ids of inactive plugins may stay stored; they are ignored while inactive. */
export const signInSettingsSchema = z.object({
  /** Allowed primary methods in login-page order. */
  methods: z
    .array(signInMethodIdSchema)
    .min(1, Errors.SignInMethodRequired)
    .max(20)
    .superRefine(unique),
  /** Second factors users may use. */
  secondFactors: z.array(secondFactorIdSchema).max(20).superRefine(unique),
  /** Roles that must complete a second factor; members without one enroll while signing in. */
  requireSecondFactor: z.array(roleSchema).max(50).superRefine(unique),
});

export type SignInSettings = z.output<typeof signInSettingsSchema>;
export type SignInSettingsInput = z.input<typeof signInSettingsSchema>;

export const DEFAULT_SIGN_IN_SETTINGS: SignInSettings = {
  methods: ['password', 'passkey', 'sso'],
  secondFactors: ['totp', 'passkey', 'recovery-code'],
  requireSecondFactor: [],
};

const registered = z.object({
  label,
  /** `core` or the providing plugin's id. */
  source: z.string(),
});

export const adminSignInSettingsSchema = signInSettingsSchema.extend({
  /** Everything registered right now. */
  available: z.object({
    methods: z.array(
      registered.extend({
        id: signInMethodIdSchema,
        /** Configured enough to sign anyone in (e.g. SSO with an enabled provider). */
        ready: z.boolean(),
      }),
    ),
    secondFactors: z.array(registered.extend({ id: secondFactorIdSchema })),
  }),
  /** The server's `CMS_ALLOW_PASSWORD_LOGIN` keeps password sign-in allowed regardless. */
  passwordForced: z.boolean(),
});

export type AdminSignInSettings = z.output<typeof adminSignInSettingsSchema>;
