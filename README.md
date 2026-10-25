# cms

WordPress를 꿈꾸면서 만든 셀프호스팅 블로그 CMS입니다. 솔직히 말하면 AI 슬롭입니다. 저는 계획만 했고, 코드는 99.99% 정도 Claude가 짰습니다.

실제로 쓰는 곳은 한 군데, 제 개인 블로그뿐입니다.

## 구성

Bun 모노레포입니다. API와 웹은 HTTP로만 통신합니다.

```
apps/
  api/        API 백엔드 (ElysiaJS, Prisma + MariaDB, 플러그인 런타임)
  web/        SvelteKit 웹 (공개 테마 + 관리자 화면)
packages/
  sdk/        공유 계약 (DTO, zod 스키마, 플러그인 API, HTTP 클라이언트)
  content/    Tiptap 확장과 서버 렌더러
plugins/
  reading-time/  예제 플러그인
docs/         기능·플러그인·인증·운영 문서
```

기능은 [docs/features](docs/features)에 정리돼 있습니다. 대략 다음과 같습니다.

- 글·페이지 작성(Tiptap 에디터), 미디어, 사용자 정의 필드
- 분류, 검색(MariaDB FULLTEXT, 선택적으로 Meilisearch), 선언형 테마
- 메뉴·위젯, 댓글, SEO와 고유주소
- 사용자·역할, 로그인(비밀번호, SSO, 패스키, TOTP)
- 웹훅, WXR 가져오기/내보내기, 사이트 상태
- 플러그인 (훅·슬롯 등 확장 지점, [docs/plugins](docs/plugins))

API 라우트는 [docs/api/routes.md](docs/api/routes.md)에 있습니다.

## 본인 서버에 올리고 싶으면

운영 쪽 이야기는 [docs/operations.md](docs/operations.md)에 있고, 그 밖의 배포 가이드는 따로 만들지 않았습니다. 막히면 저장소를 AI에게 넘기고 물어보세요. 아마 금방 알려줄 겁니다.

특히 Claude에게 물어보면, 이걸 만들면서 제가 한 말이 아직 Claude 서버 어딘가에 남아 있을 테니 그걸 바탕으로 더 빠르게 답해 주지 않을까 싶습니다.

자동 업데이트 기능은 없습니다. 만들지 말지도 아직 정하지 못했습니다. 업데이트는 새 소스를 받아서 직접 다시 배포하는 방식입니다.

## 이슈와 PR

올라오면 보기는 하겠습니다. 다만 받아들이거나 처리한다는 보장은 없습니다.

## 라이선스

AGPL-3.0-or-later입니다. 전문은 루트의 `LICENSE` 파일에 있습니다. 본인 서버에 올리고 싶으면 소스를 내려받아 알아서 하시면 됩니다. 수정한 버전을 네트워크 서비스로 돌린다면, 그 서비스를 쓰는 사용자에게 수정한 소스를 제공해야 합니다.
