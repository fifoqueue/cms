import type { SiteFunctions } from '#lib/i18n/site.js';

export const siteFunctions: SiteFunctions = {
  bulkTooMany: ({ limit }) =>
    limit === undefined
      ? '선택한 항목이 너무 많습니다. 아무것도 바뀌지 않았습니다.'
      : `한 번에 최대 ${limit}개까지 선택할 수 있습니다. 아무것도 바뀌지 않았습니다.`,
  signInWith: (provider) => `${provider} 계정으로 로그인`,
  authorArchive: (name) => `${name}의 글`,
  commentOn: (author) => `${author}님:`,
  commentCount: (count) =>
    count === 0 ? '아직 댓글이 없습니다' : `댓글 ${count}개`,
  commentReplyTo: (name) => `${name}님에게 답글`,
  themePreviewing: (name) =>
    `${name} 테마를 미리 보는 중입니다. 방문자에게는 현재 테마가 보입니다.`,
  themeSearchTitle: (query) => `검색: ${query}`,
  themeSearchResults: (query) => `“${query}” 검색 결과`,
  themeResults: (count) => `결과 ${count}개`,
  themePaged: (title, page) => `${title} – ${page}쪽`,
  themePostCount: (count) => `글 ${count}개`,
  adminBarHowdy: (name) => `${name}님, 안녕하세요`,
  oembedEmbedded: (site) => `${site}에서 가져옴`,
  themeFeedTitle: (site, name) => `${site} » ${name} 피드`,
  themeAuthorPosts: (name) => `${name}님의 글 모두 보기`,
  commentSignedIn: (name) => `${name}님으로 로그인했습니다.`,
  commentRemember: (fields) => {
    const names = { name: '이름', email: '이메일', website: '웹사이트' };
    // 웹사이트 ends in a vowel; 이름 and 이메일 take 을.
    const object = fields.at(-1) === 'website' ? '를' : '을';

    return `다음 댓글에 자동으로 채워지도록 ${fields.map((field) => names[field]).join(', ')}${object} 이 브라우저의 쿠키에 1년 동안 저장합니다.`;
  },
  commentLinkLeaveAsk: (address) =>
    `댓글에 포함된 이 링크는 다른 사이트로 연결됩니다: ${address}`,
  commentBulkSelected: (count) => `${count}개 선택됨`,
  commentBulkAsk: (count) => `선택한 댓글 ${count}개에 이 작업을 적용할까요?`,
  commentBulkDeleteAsk: (count) =>
    `선택한 댓글 ${count}개를 영구 삭제할까요? 답글은 한 단계 위로 이동하며 되돌릴 수 없습니다.`,
  commentSelect: (name) => `${name}님의 댓글 선택`,
  commentModerationFor: (name) => `${name}님의 댓글 관리`,
  contentCalloutVariantName: (variant) =>
    (
      ({
        primary: '기본',
        secondary: '보조',
        success: '성공',
        danger: '위험',
        warning: '경고',
        info: '정보',
        light: '밝게',
        dark: '어둡게',
      }) as Record<string, string>
    )[variant] ?? variant,
  themeLightboxPosition: (current, total) => `${current} / ${total}`,
  themeFootnoteRef: (label) => `각주 ${label}`,
  themeFootnoteBack: (label) => `본문의 각주 ${label} 위치로 돌아가기`,
  themeFootnoteJump: (label) => `각주 목록의 ${label} 항목으로 이동`,
  commentsApproved: (count) =>
    count === 1 ? '댓글을 승인했습니다.' : `댓글 ${count}개를 승인했습니다.`,
  commentsUnapproved: (count) =>
    count === 1
      ? '댓글 승인을 취소했습니다.'
      : `댓글 ${count}개의 승인을 취소했습니다.`,
  commentsTrashed: (count) =>
    count === 1
      ? '댓글을 휴지통으로 옮겼습니다.'
      : `댓글 ${count}개를 휴지통으로 옮겼습니다.`,
  commentsDeleted: (count) =>
    count === 1
      ? '댓글을 영구 삭제했습니다.'
      : `댓글 ${count}개를 영구 삭제했습니다.`,
};
