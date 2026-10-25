import type { EmailMessage } from '#api/domain/email/ports';

type Template = Omit<EmailMessage, 'to'>;

interface Templates {
  test(site: string): Template;
  privacy(site: string, action: 'export' | 'erase', link: string): Template;
  reset(site: string, link: string, claim?: boolean): Template;
  invite(site: string, name: string, link: string, claim?: boolean): Template;
  recovery(site: string, remaining: number, used: boolean): Template;
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
  /** A reply to the recipient's comment; ends with the unsubscribe link. */
  commentReply(
    site: string,
    title: string,
    reply: CommentCopy,
    link: string,
    unsubscribe: string,
  ): Template;
  /** One message standing for `count` notices held back during a flood; reply summaries can be stopped. */
  commentSummary(
    site: string,
    count: number,
    link: string,
    unsubscribe: string,
  ): Template;
  /** Browser push titles; `others` counts earlier pushes this one replaces. */
  pushComment(name: string, title: string, others: number): string;
  pushReply(name: string, others: number): string;
  pushSummary(count: number): string;
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
  recovery: (site, remaining, used) => ({
    subject: `[${site}] Recovery codes`,
    text: used
      ? `A recovery code was used to sign in to your account. ${remaining} codes left. If this was not you, contact your administrator immediately.`
      : `New recovery codes were generated for your account. ${remaining} codes are available. Previous codes no longer work.`,
  }),
  reset: (site, link, claim) => ({
    subject: `[${site}] ${claim ? 'Set up your sign-in' : 'Reset your password'}`,
    text: claim
      ? `Set up your sign-in at ${site} within an hour:\n${link}\n\nIf you did not request this, ignore this message.`
      : `Someone asked to reset the password of your account at ${site}.\n\nChoose a new password within an hour:\n${link}\n\nIf this was not you, ignore this message; your password stays the same.`,
  }),
  invite: (site, name, link, claim) => ({
    subject: `[${site}] You are invited`,
    text: `Hello ${name},\n\nAn account was created for you at ${site}. ${claim ? 'Set up your sign-in' : 'Choose your password'} within seven days:\n${link}`,
  }),
  commentPending: (site, title, comment, link) => ({
    subject: `[${site}] Comment waiting for review: ${title}`,
    text: `${comment.authorName}${comment.authorEmail ? ` <${comment.authorEmail}>` : ''} commented on "${title}":\n\n${comment.body}${linkLine(link)}`,
  }),
  commentApproved: (site, title, comment, link) => ({
    subject: `[${site}] New comment: ${title}`,
    text: `${comment.authorName} commented on "${title}":\n\n${comment.body}${linkLine(link)}`,
  }),
  commentReply: (site, title, reply, link, unsubscribe) => ({
    subject: `[${site}] New reply to your comment on "${title}"`,
    text: `${reply.authorName} replied to your comment on "${title}":\n\n${reply.body}${linkLine(link)}\n\n--\nYou received this because you commented on ${site}. To stop emails about replies to this comment, open:\n${unsubscribe}`,
  }),
  commentSummary: (site, count, link, unsubscribe) => ({
    subject: `[${site}] ${count} new comments`,
    text: `${count} more comments arrived while notifications were paused to avoid flooding your inbox.${linkLine(link)}${unsubscribe ? `\n\n--\nTo stop emails about replies to this comment, open:\n${unsubscribe}` : ''}`,
  }),
  pushComment: (name, title, others) =>
    `${name} commented on "${title}"${others ? ` (+${others} more)` : ''}`,
  pushReply: (name, others) =>
    `${name} replied to your comment${others ? ` (+${others} more)` : ''}`,
  pushSummary: (count) => `${count} new comments`,
};

const ko: Templates = {
  recovery: (site, remaining, used) => ({
    subject: `[${site}] 복구 코드`,
    text: used
      ? `복구 코드로 계정에 로그인했습니다. 남은 코드: ${remaining}개. 본인이 아니라면 즉시 관리자에게 연락하세요.`
      : `새 복구 코드가 생성되었습니다. 사용 가능한 코드: ${remaining}개. 이전 코드는 더 이상 사용할 수 없습니다.`,
  }),
  privacy: (site, action, link) => ({
    subject: `[${site}] 개인정보 ${action === 'export' ? '내보내기' : '삭제'} 확인`,
    text: `관리자가 이 이메일 주소의 개인정보 ${action === 'export' ? '내보내기' : '삭제'}를 요청했습니다. 2일 안에 확인해 주세요:\n${link}\n요청하지 않았다면 이 메일을 무시하세요.`,
  }),
  test: (site) => ({
    subject: `[${site}] 테스트 메일`,
    text: `${site}의 메일 발송이 정상입니다.`,
  }),
  reset: (site, link, claim) => ({
    subject: `[${site}] ${claim ? '로그인 방법 설정' : '비밀번호 재설정'}`,
    text: claim
      ? `${site}에서 한 시간 안에 로그인 방법을 설정하세요:\n${link}\n\n요청하지 않았다면 이 메일을 무시하세요.`
      : `${site} 계정의 비밀번호 재설정을 요청받았습니다.\n\n한 시간 안에 새 비밀번호를 정하세요:\n${link}\n\n요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.`,
  }),
  invite: (site, name, link, claim) => ({
    subject: `[${site}] 초대장`,
    text: `${name}님, 안녕하세요.\n\n${site}에 계정이 만들어졌습니다. 7일 안에 ${claim ? '로그인 방법을 설정하세요' : '비밀번호를 정하세요'}:\n${link}`,
  }),
  commentPending: (site, title, comment, link) => ({
    subject: `[${site}] 검토 대기 댓글: ${title}`,
    text: `${comment.authorName}${comment.authorEmail ? ` <${comment.authorEmail}>` : ''}님이 "${title}"에 댓글을 남겼습니다:\n\n${comment.body}${linkLine(link)}`,
  }),
  commentApproved: (site, title, comment, link) => ({
    subject: `[${site}] 새 댓글: ${title}`,
    text: `${comment.authorName}님이 "${title}"에 댓글을 남겼습니다:\n\n${comment.body}${linkLine(link)}`,
  }),
  commentReply: (site, title, reply, link, unsubscribe) => ({
    subject: `[${site}] "${title}"에 남긴 댓글에 새 답글`,
    text: `${reply.authorName}님이 "${title}"에 남기신 댓글에 답글을 달았습니다:\n\n${reply.body}${linkLine(link)}\n\n--\n${site}에 댓글을 남기셔서 받은 메일입니다. 이 댓글의 답글 알림을 그만 받으려면 다음 주소를 여세요:\n${unsubscribe}`,
  }),
  commentSummary: (site, count, link, unsubscribe) => ({
    subject: `[${site}] 새 댓글 ${count}개`,
    text: `알림이 너무 많아 잠시 모아 두는 동안 댓글 ${count}개가 더 달렸습니다.${linkLine(link)}${unsubscribe ? `\n\n--\n이 댓글의 답글 알림을 그만 받으려면 다음 주소를 여세요:\n${unsubscribe}` : ''}`,
  }),
  pushComment: (name, title, others) =>
    `${name}님이 "${title}"에 댓글을 남겼습니다${others ? ` (외 ${others}개)` : ''}`,
  pushReply: (name, others) =>
    `${name}님이 회원님의 댓글에 답글을 남겼습니다${others ? ` (외 ${others}개)` : ''}`,
  pushSummary: (count) => `새 댓글 ${count}개`,
};

/** Mail copy in the site's language (English unless it is Korean). */
export const templates = (locale: string): Templates =>
  locale.toLowerCase().startsWith('ko') ? ko : en;
