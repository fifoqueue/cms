import type { CaptchaWidget } from '@cms/sdk';

export const CORE_CAPTCHA_WIDGETS: Record<string, CaptchaWidget> = {
  turnstile: {
    script:
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    render: 'turnstile.render',
    // https://developers.cloudflare.com/turnstile/reference/content-security-policy/
    origins: ['https://challenges.cloudflare.com'],
    attributes: {},
    responseField: 'cf-turnstile-response',
  },
  hcaptcha: {
    script: 'https://js.hcaptcha.com/1/api.js?render=explicit',
    render: 'hcaptcha.render',
    // https://docs.hcaptcha.com/#content-security-policy-settings
    origins: ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
    attributes: {},
    responseField: 'h-captcha-response',
  },
  recaptcha: {
    script: 'https://www.google.com/recaptcha/api.js?render=explicit',
    render: 'grecaptcha.render',
    // https://docs.cloud.google.com/recaptcha/docs/faq
    origins: [
      'https://www.google.com',
      'https://www.gstatic.com',
      'https://recaptcha.google.com',
    ],
    attributes: {},
    responseField: 'g-recaptcha-response',
  },
};
