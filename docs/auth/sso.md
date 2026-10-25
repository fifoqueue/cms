# SSO (OpenID Connect)

상위 문서: [AGENTS.md](../../AGENTS.md)

OIDC Authorization Code + PKCE를 사용합니다. **설정 → 싱글 사인온**에서 켭니다(제공자 주소, 클라이언트 ID·비밀(봉인 저장), 인증 방식, 스코프, 연결 없이 허용할 주체). 관리 화면에서 설정하는 제공자의 리디렉션 URI는 기존과 같은 SEO 사이트 주소 + `/admin/sso/callback`이며 화면에 표시됩니다. 로그인·초대 연결·계정 연결 모두 이 URI를 유지하므로 업그레이드 시 IdP 등록 주소를 바꿀 필요가 없습니다. 환경변수로 고정한 제공자는 `OIDC_REDIRECT_URI`를 그대로 사용합니다. 플러그인 로그인 메서드의 `callbackUrl`은 `/admin/sign-in/callback`입니다. 두 웹 콜백은 같은 흐름을 처리합니다. 환경변수는 관리자 설정보다 우선합니다(`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`가 **모두** 있어야 하고 일부만 있으면 시작 시 설정 오류). 비밀 값은 API 서버에만 있습니다.

| 변수                                | 설명                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `OIDC_ISSUER`                       | 제공자 issuer (https, 쿼리 없음)                                                           |
| `OIDC_CLIENT_ID`                    | 클라이언트 ID                                                                              |
| `OIDC_REDIRECT_URI`                 | 웹 앱의 `/admin/sso/callback` URL (제공자에 등록)                                          |
| `OIDC_CLIENT_SECRET`                | 클라이언트 비밀. `OIDC_CLIENT_AUTH_METHOD`가 `none`이 아니면 필수                          |
| `OIDC_CLIENT_AUTH_METHOD`           | `client_secret_basic`(비밀이 있을 때 기본) · `client_secret_post` · `none`(PKCE만)         |
| `OIDC_SCOPES`                       | 공백 구분, 기본 `openid` (반드시 포함)                                                     |
| `OIDC_NAME`                         | 로그인 버튼 표시 이름 (기본 `SSO`, 최대 64자)                                              |
| `CMS_ALLOW_PASSWORD_LOGIN`          | Boolean, 기본 false. 저장된 정책을 바꾸지 않고 비밀번호 로그인을 강제로 켜는 비상용 재정의 |
| `OIDC_ALLOWED_SUBJECTS`             | JSON `{ "<subject>": "<기존 관리자 이메일>" }` — 연결 없이 로그인할 수 있는 주체 목록      |
| `OIDC_FRONTEND_SECRET`              | `CMS_FRONTEND_SECRET`의 옛 이름(선택). 없으면 자동 연결된 비밀을 씁니다                    |
| `OIDC_MAX_PENDING_REQUESTS`         | 대기 중 인증 요청 수 전체 상한. 기본 1000, 범위 1–100000                                   |
| `OIDC_MAX_PENDING_PER_CLIENT`       | 클라이언트 하나의 대기 요청 상한. 기본 10, 전체 상한 이하                                  |
| `OIDC_STARTS_PER_MINUTE`            | 분당 SSO 시작 수 전체 상한(**API 프로세스마다**). 기본 300                                 |
| `OIDC_STARTS_PER_MINUTE_PER_CLIENT` | 클라이언트 하나의 분당 SSO 시작 수(프로세스마다). 기본 10, 전체 이하                       |

- 계정은 **제공자의 이메일 클레임으로 절대 자동 연결하지 않습니다.** 기존 사용자와의 연결은 로그인한 상태에서 `start`(연결) → `callback`으로 명시적으로 `issuer`+`subject`를 묶거나, 운영자가 제공자별 허용 목록에 직접 등록한 주체만 가능합니다. 초대·재설정 토큰 소유자는 아래 `claim` 흐름으로 연결할 수 있습니다.
- `sso`는 `{ settings: { providers }, secrets: { [providerId]: sealedSecret } }` 형태로 저장합니다. 예전의 단일 제공자 설정은 제공자 `default`로 읽습니다. 예전 `passwordLogin: false`는 SSO 저장이 이 필드를 제거하기 전에 설정 → 로그인의 `methods: ['sso']`로 마이그레이션됩니다. 입력으로 들어오는 선택적 `passwordLogin`은 한 릴리스 동안 받아들이되 무시하며, 출력에는 이 필드와 `passwordLoginForced`가 없습니다. 제공자 클라이언트는 각각 따로 캐시합니다. `OIDC_*`는 제공자 목록만 `environment`로 대체합니다. 관리자 DTO는 `clientSecretConfigured`만 노출하고 비밀은 노출하지 않습니다.
- 생략한 비밀을 유지하려면 issuer URL도 동등해야 합니다. 새 비밀 없이 issuer를 바꾸면 `providers.<index>.clientSecret`에서 거부합니다. 제공자 바인딩과 정책 매칭은 `new URL(issuer).href`를 비교하며(루트 후행 슬래시 동등성 포함), 저장된 검증된 `iss`와 subject 바이트는 정확히 그대로 유지합니다.
- `sso` 엔진 방식은 활성화된 제공자를 나열하고, 선택한 제공자로 리디렉션하며, 서버가 보관한 OIDC 검사로 콜백 쿼리를 검증합니다. 설정은 초대·재설정 토큰을 쓰고, 토큰 소비와 함께 연결 claim을 커밋한 뒤 엔진의 로그인·인증 요소 정책을 적용합니다. 만료되었거나 사용한 토큰과 허용 목록 주체는 claim할 수 없습니다. SSO `/start`와 `/callback` HTTP 라우트는 이제 인증된 계정 연결만 받으며, 예전 방식의 로그인·claim 요청은 클라이언트에 단계별 흐름을 안내하는 409를 반환합니다.
- claim에 성공하면 같은 트랜잭션에서 해당 사용자의 미사용 재설정·초대 토큰을 모두 삭제합니다. claim은 해당 issuer에 이미 있는 연결의 교체를 거부하며, 교체는 인증된 계정 연결로만 합니다. 마이그레이션의 `provider_id` 기본값은 `default`입니다.
- 허용되는 기본 로그인 방식은 설정 → 로그인에서만 정합니다. 비밀번호를 제외하면 비밀번호 로그인, 공개 비밀번호 찾기 요청, 링크를 통한 비밀번호 선택이 막힙니다. 초대·관리자 재설정 이메일은 `/admin/password?token=…`를 유지하되 수신자에게 로그인 설정을 안내합니다. `CMS_ALLOW_PASSWORD_LOGIN`은 유효 방식에 비밀번호를 추가하며, 로그인 설정 DTO에 `passwordForced`로 노출됩니다.
- 제공자 수정과 마지막 연결 해제 검사는 로그인 정책의 `signIn.admission` 행 잠금과 범위가 지정된 DB 트랜잭션을 공유합니다. 작업하는 사용자가 쓸 수 있는, 허용되고 준비된 다른 방식이 없으면 제공자 수정은 해당 사용자의 연결·할당된 접근을 유지해야 하고, 연결 해제는 할당이 남아 있지 않은 한 마지막으로 일치하는 연결을 제거할 수 없습니다. 제공자를 복원할 때 일시적인 런타임 비밀번호 대체는 명시적으로 허용된 대안이 아닙니다. 접근 문제는 `providers`를, 누락된 비밀은 `providers.<index>.clientSecret`을 씁니다.
- 복구 코드에는 현재 `settings.manage`가 필요합니다. 생성하면 80비트 코드 10개로 전체를 교체하고 한 번만 반환하며, 다이제스트만 저장합니다. 입력은 대소문자를 구분하지 않고 하이픈은 선택입니다. 복구는 로그인 보호·방문자 헤더를 쓰고, 동시 요청에서도 한 번만 소비하며, 연결 바인딩 없는 세션을 발급하고 경고를 기록합니다. 이메일이 켜진 사이트는 생성할 때와 사용할 때(남은 개수) 알립니다. 개인정보 내보내기에는 코드 메타데이터만 포함하며, 삭제하면 코드도 제거됩니다.
- 생성에는 추가로 만료되지 않고 10분 안에 발급된 대화형 세션이 필요하며 API 토큰은 거부합니다. 복구는 없거나 자격이 없는 계정에 대해서도 권한 해석과 소비 시도를 수행합니다(소비에는 더미 사용자 id 사용). 알림 실패는 기록만 하며 생성된 코드를 잃거나 그 외에는 성공한 세션을 거부하지 않습니다. 비밀번호 재설정·변경과 관리자의 전체 기기 로그아웃은 복구 코드를 트랜잭션으로 삭제합니다.
- `20261109000000_sso_providers_recovery`는 대기 중인 SSO 요청만 폐기하고, 제공자·claim 필드와 복구 코드를 추가하며, 단일 사용자 연결 인덱스를 `(user_id, issuer)`로 바꿉니다. 기존 연결 바이트, id, 바인딩된 세션은 유지됩니다. 배포 전에 Prisma를 생성·검증하고, 마이그레이션 후에는 예전 단일 제공자 기록기를 실행하지 마세요.
- 인증 상태(`state`, `nonce`, PKCE verifier)는 서버의 `sso_transactions`에만 있으며 1회용이고 10분 뒤 만료됩니다. 브라우저에는 핸들만 전달됩니다.
- **정확한 식별자 비교**: `issuer`·`subject`는 `user_identities`에 UTF-8 바이트(`VARBINARY(255)`)로 저장되고 유일 인덱스도 바이트 단위입니다. 대소문자 접기·정규화·후행 공백 무시가 없으므로 `Alice`와 `alice`는 다른 계정입니다. 도메인은 조회 결과의 값이 검증된 값과 정확히 같을 때만 받아들이고, 올바른 유니코드가 아니거나 255바이트를 넘는 값은 거부합니다. 이 컬럼을 텍스트 콜레이션으로 바꾸지 마세요.
- **세션 폐기**: 연결(`user_identities`)마다 불변 `id`가 있고, 연결을 통해 발급한 세션은 `sessions.identity_id`(FK, `ON DELETE CASCADE`)로 묶입니다. 연결 해제나 다른 계정으로 교체하면 DB가 같은 문장에서 그 세션들을 지웁니다. 해제와 경합한 로그인은 FK 위반으로 거부되어(401) 세션이 남지 않습니다. 비밀번호 세션은 영향받지 않습니다. 관리자 화면의 '내 계정'에서 연결·해제할 수 있습니다.
- 운영자 할당(`OIDC_ALLOWED_SUBJECTS`)으로 로그인한 세션은 연결에 묶이지 않습니다. 할당을 지우고 재시작하면 새 로그인은 막히지만, 기존 세션은 만료(`SESSION_TTL_HOURS`)나 로그아웃까지 유지됩니다.
- **시작 속도 제한(먼저 검사)**: `start`는 제공자 호출·DB 접근 전에 `RateLimiter`(`domain/ports.ts`)로 클라이언트별·전체 속도를 동기적으로 예약합니다. 초과하면 429 `rate_limited`이며 그 요청은 아무 작업도 하지 않습니다. 구현 `infra/memory-rate-limiter.ts`는 프로세스 메모리의 토큰 버킷(창 60초)이라 **API 인스턴스마다 따로** 셉니다. 인스턴스가 N개면 실제 허용량은 최대 N배이고, 재시작하면 초기화됩니다. 키는 허용된 시도 뒤에만 기억하고 마지막 허용 후 한 창이 지나면 잊으므로, 기억하는 키는 최대 전체 한도의 2배입니다.
- **요청 등록 상한(프로세스 간)**: 속도 제한을 통과한 등록은 DB 트랜잭션과 공통 행 잠금(`settings`의 `sso.admission`)으로 직렬화해 모든 인스턴스를 합쳐 전체 상한과 클라이언트별 상한을 함께 지킵니다. 만료 요청은 다음 등록 시 정리합니다. 상한에 도달하면 SSO 시작만 409로 거부되고 비밀번호 로그인은 유지됩니다.
- **클라이언트 식별**: API는 웹 서버만 보므로 방문자 주소는 웹 서버가 증명합니다. 웹은 보호되는 요청(로그인·비밀번호 재설정·댓글·SSO 시작)에 `getClientAddress()`(adapter-node의 프록시 설정 `ADDRESS_HEADER`/`XFF_DEPTH`를 따름)와 프런트엔드 비밀을 `x-cms-client-address`/`x-cms-frontend-secret` 헤더로 보냅니다. 댓글 작성·관리자 답글에는 브라우저 `User-Agent`도 `x-cms-client-user-agent`(`CLIENT_USER_AGENT_HEADER`, SDK `ClientProof.userAgent`)로 보내며, API는 주소와 마찬가지로 비밀이 일치할 때만 믿고(제어 문자 제거·공백 정리·255자 제한) 그 밖에는 null로 저장합니다([댓글](../features/comments.md#작성자-ip-주소와-사용자-에이전트)). API는 비밀이 일치할 때만(상수 시간 비교) 주소를 믿고 IPv4 주소 또는 IPv6 /64 단위로 셉니다. 비밀이 없거나 틀린 요청(API 직접 호출 포함)은 주장한 주소와 무관하게 하나의 공용 할당량과 속도를 나눠 씁니다. 연결 요청은 사용자 단위로 셉니다. 속도 제한과 등록 상한은 같은 클라이언트 키를 씁니다. 여러 주소를 가진 공격자는 전체 상한까지 채울 수 있습니다.
- 라우트 파일: `http/routes/api/v1/auth/sso/{index,start,callback,identity}.ts`, `admin/sso.ts`, 서비스: `domain/auth/sso-service.ts`, 설정: `domain/auth/sso-settings.ts`, 클라이언트 식별: `http/client-identity.ts`.
- 마이그레이션 `20261023000000_sso_exact_identity_sessions`는 적용 시 **모든 세션과 대기 중 SSO 요청을 삭제**합니다(모두 다시 로그인). 계정·연결·콘텐츠·플러그인은 유지됩니다. 적용 전에 DB를 백업하세요.
