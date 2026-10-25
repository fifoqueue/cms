# packages/sdk 규약

상위 문서: [AGENTS.md](../../AGENTS.md)

`@cms/sdk`는 API·웹·플러그인이 공유하는 계약입니다(DTO·zod 스키마, 플러그인 API, HTTP 클라이언트).

- **공유 스키마**: 신뢰 경계의 검증 스키마는 여기에 둡니다. 공개/관리자 DTO는 분리하며 허용 필드를 명시합니다([apps/web/AGENTS.md](../../apps/web/AGENTS.md#공개관리자-dto-경계)).
- **오류 카탈로그**: 메시지는 `#sdk/errors`의 `Errors`에서 가져옵니다([루트 코드 스타일](../../AGENTS.md#43-코드-스타일)).
- **클라이언트**: `createContentClient`(공개)·`createAuthClient`·`createAdminClient`로 분리하고, 응답 DTO를 런타임에 검증합니다.
- **플러그인 API**: `@cms/sdk/plugin`. 새 훅은 `packages/sdk/src/hooks/<분야>.ts`에 정의합니다. 문서: [작성](../../docs/plugins/authoring.md), [확장 지점](../../docs/plugins/extension-points.md), [수명주기·격리](../../docs/plugins/lifecycle-and-isolation.md).
