import type { AdminLocale } from '@cms/sdk/locales';

// Sign-in, password and registration copy that the shared catalogs do not carry. Every language
// implements the same keys and parameters.
const en = {
  links: 'Account links',
  showPassword: 'Show password',
  passwordHint: (min: number) => `Use at least ${min} characters.`,
  linkInvalid:
    'This link is incomplete. Open the link from your email again, or request a new one.',
  requestLink: 'Request a new link',
  registerSent:
    'If this address can be used, a link to choose your password is on its way. Check your inbox.',
};

type AuthMessages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const ko: AuthMessages = {
  links: '계정 링크',
  showPassword: '비밀번호 표시',
  passwordHint: (min) => `${min}자 이상 입력하세요.`,
  linkInvalid:
    '링크가 완전하지 않습니다. 이메일의 링크를 다시 열거나 새 링크를 요청하세요.',
  requestLink: '새 링크 요청하기',
  registerSent:
    '사용할 수 있는 주소라면 비밀번호를 정하는 링크를 보냈습니다. 받은편지함을 확인하세요.',
};

const catalogs: Record<AdminLocale, AuthMessages> = { en, ko };

/** The authentication copy for a catalog language (`useI18n().language`). */
export const authMessages = (language: AdminLocale) => catalogs[language];
