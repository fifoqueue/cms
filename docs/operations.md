# 운영·환경 설정

## 미디어 저장소 운영

마이그레이션 `20261114000000_media_storage`는 로컬 URL과 원본 바이트 수를 채웁니다. 이전 버전의 변환본(variant) 바이트 수는 다시 동기화(resync)하기 전까지 null로 남습니다. MariaDB, 로컬 미디어, 사이트의 비밀 키를 함께 백업하세요.

저장소 설정은 환경변수 전용 설정이 아니라 관리자가 관리하는 `media.storage` 값입니다. S3 비밀 값은 `SecretBox`로 봉인되며 다시 반환되지 않습니다. 어댑터는 SigV4 서명에만 `aws4fetch`를 쓰며, 확인(probe)·업로드·읽기·삭제·페이지 단위 목록 조회는 모두 서비스 `media-storage`로 DNS를 고정한 egress 전송을 사용합니다. 사설 MinIO 엔드포인트는 그 서비스에 대한 호스트/포트/주소 egress 규칙을 명시해야 합니다. 리디렉션은 서명된 자격 증명을 전달하지 않기 위해 거부되므로 올바른 리전 엔드포인트를 설정하세요. AWS, R2, MinIO, B2, Wasabi는 엔드포인트/리전/버킷을 설정하고, 각 제공자의 리전 및 path-style 요구 사항을 따릅니다. 확인(probe)에는 PutObject/DeleteObject가 필요하고, 전송에는 GetObject, 다시 동기화에는 접두사 아래의 ListBucket이 필요합니다.

한 번 정한 S3 엔드포인트/버킷/접두사는 그 자리에서 바꿀 수 없습니다. 기존 자산이 그 위치에 의존하기 때문입니다. 로컬/S3 전환은 이 설정을 보존하며, 자격 증명 교체는 지원합니다. 기존 객체를 다른 버킷/제공자로 옮기는 일은 자동으로 되지 않고 후속 마이그레이션 작업으로 남아 있습니다. CDN 변경은 새 업로드와 다시 동기화로 갱신된 URL에만 영향을 주며, 저장된 콘텐츠에 이미 삽입된 URL에는 영향을 주지 않습니다.

상위 문서: [AGENTS.md](../AGENTS.md)

## 공개 페이지의 Content-Security-Policy

앱은 공개 페이지에서 `script-src`, `style-src`, `font-src`를 보내지 않습니다(관리자와 로그인 응답에만 `frame-ancestors`를 보냅니다). 리버스 프록시가 이런 정책을 추가한다면 다음을 허용하세요.

- 첫 렌더링 전에 방문자의 라이트/다크 선택을 복원하는 인라인 head 스크립트, 그리고 대체 팔레트, 테마 `style.css`, 사이트 글꼴 `@font-face` 규칙을 위한 인라인 `<style>` 요소. 이들은 nonce나 해시를 갖지 않으므로(테마 설정에 따라 바뀜) 엄격한 정책에서는 `'unsafe-inline'`이 필요하며, 그렇지 않으면 테마의 색상 모드 전환과 사이트 글꼴을 쓰지 말아야 합니다.
- 테마 → 편집기 → 스타일에서 추가한 사이트 글꼴의 출처: `style-src`에는 스타일시트 호스트(예: `https://fonts.googleapis.com`), `font-src`에는 글꼴 파일 호스트(예: `https://fonts.gstatic.com`). 미디어 라이브러리에 업로드한 글꼴은 동일 출처입니다.

## 실행과 배포

플러그인의 일회성 잡은 코어 큐와 지수 백오프 재시도 정책을 공유합니다. 지연 잡을 포함해 페이로드는 항상 사이트의 비밀 키로 봉인됩니다. 플러그인을 비활성화하면 그 핸들러가 해제되어, 큐에 있던 잡은 알 수 없는 종류로 실패합니다. 비밀 키는 데이터베이스 백업과 함께 보관하세요.

로그인 예약/바인딩 마이그레이션은 `20261112000000_passkey_discoverable` 다음의 `20261113000000_sign_in_reservations`입니다. 이전의 임시 예약 타임스탬프는 배포하면 안 됩니다. 업데이트된 API를 실행하기 전에 Prisma를 생성하고 마이그레이션을 적용하세요. 관리형 SSO 제공자는 기존 `/admin/sso/callback` 등록을 유지하고, 환경변수 제공자는 계속 `OIDC_REDIRECT_URI`를 씁니다. 플러그인 리디렉션 방식은 `/admin/sign-in/callback`을 씁니다.

운영 실행은 루트의 `ecosystem.config.cjs`(pm2)를 씁니다: `bun install` → `bun run --filter @cms/api db:generate` → `bun run --filter @cms/web build` → `pm2 start ecosystem.config.cjs` (API :4000, 웹 :3000, 둘 다 기본 `127.0.0.1`에서만 수신 — 앞에 https 리버스 프록시를 둡니다). `.env`는 필요 없습니다.

웹 빌드는 `../board`처럼 **릴리스로 승격**합니다. `bun run --filter @cms/web build`는 `vite build` 뒤에 `apps/web/scripts/release.js`를 실행해 `build/`를 `apps/web/.web-releases/<내용 해시>/`로 복사하고 `.active-web-release`가 그것을 가리키게 합니다. `server.js`는 활성 릴리스에서 시작하므로, 다시 빌드해도 실행 중인 서버의 파일은 바뀌지 않습니다(새 릴리스는 `pm2 restart cms-web`부터). 12시간 안에 물러난 릴리스의 해시된 브라우저 에셋은 남아 있는 릴리스에 하드 링크로 이어 붙여 이미 열린 페이지도 스크립트를 불러오고, 그보다 오래된 릴리스는 다음 승격 때 지웁니다. 압축(.br/.gz)은 만들지 않습니다(리버스 프록시가 압축). `server.js`는 `X-Forwarded-Proto`가 없는 직접 연결에 실제 스킴을 채워, http로 접속해도 폼 전송이 CSRF 검사(403)에 막히지 않습니다. 리버스 프록시는 `X-Forwarded-Proto`를 넘겨야 합니다. 방문자 주소(속도 제한, 댓글 IP)도 기본으로 `X-Forwarded-For`에서 읽습니다(`ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`: 가장 가까운 프록시가 덧붙인 맨 오른쪽 값). 프록시가 여러 단(예: CDN → nginx)이면 `XFF_DEPTH`를 그 수로 올리고, `CF-Connecting-IP`·`X-Real-IP`만 보내는 프록시라면 `ADDRESS_HEADER`를 그 이름으로 바꿉니다. 헤더 없이 직접 들어온 연결은 소켓 주소를 씁니다. 웹 서버는 기본으로 127.0.0.1에서만 받으므로 이 헤더는 로컬 프록시만 넣을 수 있습니다. `WEB_HOST`를 공개 주소로 열고 프록시 없이 쓸 때는 `ADDRESS_HEADER=`(빈 값)로 꺼야 주소를 위조할 수 없습니다.

**`.env`는 루트 하나만 씁니다**(`.env.example` 참고, 앱별 `.env` 없음). API·웹 실행 스크립트와 pm2는 `bun --env-file=../../.env`, 웹 개발 서버와 SvelteKit은 `env.dir`, Prisma CLI는 `prisma.config.ts`가 이 파일을 읽으며, 이미 설정된 환경변수가 우선합니다. 두 서버가 같은 파일을 읽으므로 포트·주소는 `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`로 나눕니다. 웹은 `CMS_API_URL`이 없으면 `http://127.0.0.1:<API_PORT>`로 API를 찾습니다.

## 설치 마법사와 설정 저장

첫 접속은 `/admin/setup`으로 안내됩니다. API 콘솔의 설치 키와 MariaDB 접속 정보를
입력하면 연결 확인·마이그레이션·설정 저장이 자동으로 진행됩니다. 로컬 Docker 기본값은
호스트 `localhost`, 포트 `3306`, DB/사용자/비밀번호 `cms`입니다. 운영에서는 미리 생성한
별도의 DB와 테이블 생성 권한이 있는 계정을 사용하고 HTTPS로 설치하세요.
다음 단계에서 사이트 정보와 첫 관리자 계정을 만들면 자동 로그인되고 재설치는 차단됩니다.
설치 완료 시 웹에서 접속한 origin을 검증해 SEO의 사이트 URL로 함께 저장합니다. 이후 관리자 SEO 설정에서 변경할 수 있습니다.
DB/사용자 자체를 생성하거나 기존 데이터를 초기화하지는 않습니다.

접속 정보는 `apps/api/data/config.json`에 저장됩니다(`.env` 편집 불필요).
이 파일은 비밀번호를 포함하므로 공개하지 말고 DB와 함께 백업하세요. Unix에서는 파일
권한 `0600`으로 생성하며, Windows에서는 서비스 계정만 읽도록 폴더 ACL을 설정하세요.
설치 키는 재시작할 때 바뀌며 설치 미완료 시에만 콘솔에 표시됩니다.
중간에 중단한 설치는 저장된 DB 설정으로 이어갑니다. DB 연결 장애나 손상된 설정은
새 설치로 취급하지 않습니다. 기존 `DATABASE_URL` 환경변수는 저장된 파일보다 우선하고,
다른 고급 환경변수도 유지됩니다. 시작 시 마이그레이션이 자동 적용됩니다.

## `.env` 없이 운영하기

매시간 유지보수 작업은 저장된 TOTP 비밀 값을 현재 `SecretBox` 키로 다시 봉인하고 `resealed`, `unreadable`, `skipped` 개수를 기록하며, unreadable/skipped 개수가 0이 아니면 경고도 남깁니다. 읽을 수 없는 행을 복구하고, 건너뛴 행을 다시 확인하고, 대기 중인 등록이 끝나거나 만료될 때까지 모든 인스턴스에 `CMS_SECRET_KEY_PREVIOUS`를 유지하세요. TOTP 검증에 성공해도 시간 단계를 원자적으로 소비하면서 다시 봉인합니다.

**`.env` 없이 운영할 수 있어야 합니다(WordPress의 `wp-config.php`처럼 선택 사항).** 사이트 운영에 필요한 설정은 모두 관리자 화면에 있습니다: DB 접속(설치 마법사), 메일, 캡차·속도 제한, 싱글 사인온, Meilisearch, 페이지 캐시(설정 → 읽기) 등. 새 설정을 추가할 때도 env 전용으로 만들지 말고 `settings`에 저장하는 관리자 설정으로 만듭니다(비밀 값은 `SecretBox`로 봉인). 환경변수는 기본값을 바꾸는 **선택적 재정의**로만 둡니다.

- `bun run --filter @cms/web start`(`apps/web/server.js`)는 업로드를 위해 `BODY_SIZE_LIMIT`을 기본 64MB로 두되, 훅이 일반 폼 64KB·콘텐츠 2MB·플러그인 6MB·WXR 17MB로 먼저 제한합니다. API JSON은 기본 512KB(공개 인증·댓글 32KB, 콘텐츠 1MB), WXR은 16MB입니다.
- 웹 시작 시 루트 `.env`를 읽은 뒤 DB 주소·API 비밀 키·OIDC 클라이언트 비밀 같은 API 전용 변수를 제거하고 앱을 불러옵니다. 웹 런타임에는 `WEB_*`, `CMS_API_URL`, 방문자 증명 비밀 등 필요한 값만 남아야 합니다.
- 비밀 키는 자동입니다. `CMS_SECRET_KEY`가 없으면 `apps/api/data/secret.key`를 만들어 씁니다(DB와 함께 백업; API 인스턴스가 여러 개면 같은 값을 공유). 키를 바꿀 때는 모든 인스턴스에 새 `CMS_SECRET_KEY`와 이전 `CMS_SECRET_KEY_PREVIOUS`를 함께 설정합니다. 이전 키를 없애기 전에 대기 중인 잡을 모두 처리하고 저장된 비밀 값을 관리자 화면에서 다시 입력해 저장(웹훅 비밀은 회전)하세요.
- 비밀번호 재설정·가입·초대 링크를 포함한 이메일 잡 본문은 `SecretBox`로 봉인해 저장합니다. 최종 실패한 잡은 본문을 즉시 지우되, 키가 달라 열 수 없는 암호문은 키 복구를 위해 보존하고 매시간 다시 확인합니다. 기존 실패 잡의 평문도 유지보수 작업이 회당 500개씩 지웁니다. 실패 기록은 30일 뒤 정리합니다.
- **이메일 잡 형식 업그레이드는 롤링 배포하지 않습니다.** 이전 API 프로세스를 모두 중지한 뒤 새 버전을 모두 시작하세요. 새 프로세스는 기존 평문 잡을 읽지만, 이전 프로세스는 새 암호화 봉투를 읽지 못합니다. 이전 버전으로 되돌리기 전에는 새 버전으로 암호화 잡을 비우거나 새 리더를 유지해야 합니다.
- 웹↔API 방문자 증명 비밀은 비밀 키에서 파생되며, 관리자가 로그인하면 웹 서버가 `GET /api/v1/admin/frontend-secret`으로 받아 `apps/web/data/frontend.secret`(0600)에 보관합니다. 그 전까지 방문자는 공용 할당량을 나눠 씁니다. 두 서버에 같은 `CMS_FRONTEND_SECRET`(32자 이상)을 두면 이 과정을 건너뜁니다.
- 브라우저 푸시(설정 → 토론 `pushNotifications`)의 VAPID 키 쌍(P-256)은 처음 필요할 때 한 번 만들어 설정 키 `push.vapid`에 저장합니다. 생성은 `push.vapid` 설정 행 잠금 안에서 하므로 인스턴스가 여러 개여도 한 쌍만 생깁니다. 공개 키만 API 밖으로 나가고(`notifications.push`, `GET /api/v1/admin/push-subscription`), 개인 키는 `SecretBox`로 봉인됩니다. 비밀 키를 이전 키 없이 바꾸면 개인 키를 열 수 없어 푸시 발송 잡이 실패합니다(`PushKeyUnreadable` 로그). 키 쌍을 지우면 새 쌍이 생기고 기존 브라우저 구독은 모두 403으로 무효 처리되어 다시 구독해야 합니다. VAPID `sub`는 사이트 주소가 `https://`이면 그 origin, 아니면 첫 관리자 이메일(`mailto:`)입니다.
- 푸시 발송은 방문자가 준 엔드포인트로 나가므로 허용 목록(`PUSH_SERVICE_HOSTS`: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`; https, 포트 443, 자격 증명·프래그먼트 없음)을 등록할 때와 보낼 때 모두 확인하고, DNS를 고정하는 egress 전송(서비스 지정 없음 = 공인 주소만, 사설 주소 규칙은 적용되지 않음)으로 보내며 리디렉션을 따르지 않습니다(3xx는 영구 실패). 아웃바운드 방화벽이 있으면 위 호스트의 443 포트를 열어야 합니다.
- TOTP 비밀은 봉인되어 저장되며, 검증에 성공하면 시간 단계를 소비하면서 현재 키로 원자적으로 다시 봉인합니다. 키를 교체할 때는 모든 인스턴스에 현재·이전 키를 일관되게 설정하고, 이전 키를 없애기 전에 TOTP 재봉인 유지보수 작업을 실행하세요. 읽을 수 없거나 건너뛴 레코드는 해결하고, 대기 중인 등록은 끝나거나 만료되게 둡니다. (Passkey 주의사항: [로그인](auth/sign-in.md#패스키와-totp))
- 선택적 재정의(루트 `.env.example`): `DATABASE_URL`, `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`, `CMS_API_URL`, `MEDIA_DIR`/`PLUGINS_DIR`(인스턴스가 여러 개면 공유 저장소), `MEDIA_MAX_MB`, `SESSION_TTL_HOURS`, `PLUGIN_TIMEOUT_MS`, `SCHEDULER_INTERVAL_MS`, `CMS_EGRESS_ALLOWLIST`, `OIDC_*`(서버에서 SSO를 고정할 때; 있으면 관리자 SSO 설정보다 우선).
