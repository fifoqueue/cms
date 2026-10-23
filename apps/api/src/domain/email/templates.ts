import type { EmailMessage } from '#api/domain/email/ports';

type Template = Omit<EmailMessage, 'to'>;

interface Templates {
  test(site: string): Template;
  privacy(site: string, action: 'export' | 'erase', link: string): Template;
  reset(site: string, link: string): Template;
  invite(site: string, name: string, link: string): Template;
  commentPending(
    site: string,
    title: string,
    comment: CommentCopy,
    link: string,
  ): Template;
  commentApproved(
    site: string,
    title: string,
    comment: CommentCopy,
    link: string,
  ): Template;
}

interface CommentCopy {
  authorName: string;
  authorEmail: string;
  body: string;
}

const linkLine = (link: string) => (link ? `\n\n${link}` : '');

const en: Templates = {
  privacy: (site, action, link) => ({
    subject: `[${site}] Confirm personal data ${action === 'erase' ? 'erasure' : 'export'}`,
    text: `An administrator requested a personal data ${action === 'erase' ? 'erasure' : 'export'} for this email address. Confirm within two days:\n${link}\nIf you did not request this, ignore this email.`,
  }),
  test: (site) => ({
    subject: `[${site}] Test message`,
    text: `Email delivery from ${site} works.`,
  }),
  reset: (site, link) => ({
    subject: `[${site}] Reset your password`,
    text: `Someone asked to reset the password of your account at ${site}.\n\nChoose a new password within an hour:\n${link}\n\nIf this was not you, ignore this message; your password stays the same.`,
  }),
  invite: (site, name, link) => ({
    subject: `[${site}] You are invited`,
    text: `Hello ${name},\n\nAn account was created for you at ${site}. Choose your password within seven days:\n${link}`,
  }),
  commentPending: (site, title, comment, link) => ({
    subject: `[${site}] Comment waiting for review: ${title}`,
    text: `${comment.authorName} <${comment.authorEmail}> commented on "${title}":\n\n${comment.body}${linkLine(link)}`,
  }),
  commentApproved: (site, title, comment, link) => ({
    subject: `[${site}] New comment: ${title}`,
    text: `${comment.authorName} commented on "${title}":\n\n${comment.body}${linkLine(link)}`,
  }),
};

const ko: Templates = {
  privacy: (site, action, link) => ({
    subject: `[${site}] 개인정보 ${action === 'export' ? '내보내기' : '삭제'} 확인`,
    text: `관리자가 이 이메일 주소의 개인정보 ${action === 'export' ? '내보내기' : '삭제'}를 요청했습니다. 2일 안에 확인해 주세요:\n${link}\n요청하지 않았다면 이 메일을 무시하세요.`,
  }),
  test: (site) => ({
    subject: `[${site}] 테스트 메일`,
    text: `${site}의 메일 발송이 정상입니다.`,
  }),
  reset: (site, link) => ({
    subject: `[${site}] 비밀번호 재설정`,
    text: `${site} 계정의 비밀번호 재설정을 요청받았습니다.\n\n한 시간 안에 새 비밀번호를 정하세요:\n${link}\n\n요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.`,
  }),
  invite: (site, name, link) => ({
    subject: `[${site}] 초대장`,
    text: `${name}님, 안녕하세요.\n\n${site}에 계정이 만들어졌습니다. 7일 안에 비밀번호를 정하세요:\n${link}`,
  }),
  commentPending: (site, title, comment, link) => ({
    subject: `[${site}] 검토 대기 댓글: ${title}`,
    text: `${comment.authorName} <${comment.authorEmail}>님이 "${title}"에 댓글을 남겼습니다:\n\n${comment.body}${linkLine(link)}`,
  }),
  commentApproved: (site, title, comment, link) => ({
    subject: `[${site}] 새 댓글: ${title}`,
    text: `${comment.authorName}님이 "${title}"에 댓글을 남겼습니다:\n\n${comment.body}${linkLine(link)}`,
  }),
};

/** Mail copy in the site's language (English unless it is Korean). */
export const templates = (locale: string): Templates =>
  locale.toLowerCase().startsWith('ko') ? ko : en;
