# 운영·환경 설정

## Media storage operations

Migration `20261114000000_media_storage` backfills local URLs and original byte counts. Legacy variant byte counts remain null until resync. Back up MariaDB, local media, and the site's secret key together.

Storage settings are administrator-owned `media.storage` values, not environment-only configuration. S3 secrets are sealed with `SecretBox` and never returned. The adapter uses `aws4fetch` for SigV4 signing only; probes, uploads, reads, deletes and paginated listings all use the DNS-pinned egress transport under service `media-storage`. Private MinIO endpoints require an explicit host/port/address egress rule for that service. Redirects are rejected rather than forwarding signed credentials; configure the correct regional endpoint. Set endpoint/region/bucket for AWS, R2, MinIO, B2 or Wasabi; use the provider's region and path-style requirements. The probe requires PutObject/DeleteObject; delivery needs GetObject and resync needs ListBucket under the prefix.

An established S3 endpoint/bucket/prefix cannot be changed in place: old assets depend on that location. Local/S3 switching preserves it; credential rotation is supported. Moving existing objects to another bucket/provider is not automatic and remains a follow-up migration job. CDN changes affect new uploads and URLs refreshed by resync, not URLs already embedded in saved content.

상위 문서: [AGENTS.md](../AGENTS.md)

## Content-Security-Policy on public pages

The app sends no `script-src`, `style-src` or `font-src` on public pages (only `frame-ancestors` on admin and sign-in responses). If a reverse proxy adds such a policy, allow:

- the inline head script that restores a visitor's light/dark choice before the first paint, and the inline `<style>` elements for the alternate palette, theme `style.css` and site-font `@font-face` rules. They carry no nonce or hash (they change with theme settings), so a strict policy needs `'unsafe-inline'` for them, or the theme's scheme toggle and site fonts must be left unused;
- the origins of site fonts added in Appearance → Editor → Styles: the stylesheet host in `style-src` (e.g. `https://fonts.googleapis.com`) and the font file host in `font-src` (e.g. `https://fonts.gstatic.com`). Fonts uploaded to the media library are same-origin.

## 실행과 배포

Plugin one-off jobs share the core queue and exponential retry policy. Their
payloads are always sealed with the site's secret key, including delayed jobs.
Disabling a plugin revokes its handlers: queued jobs then fail as unknown kinds.
Keep the secret key with database backups.

The sign-in reservation/binding migration is `20261113000000_sign_in_reservations`, after `20261112000000_passkey_discoverable`. The earlier provisional reservation timestamp must not be deployed. Generate Prisma and apply migrations before running the updated API. Managed SSO providers retain their existing `/admin/sso/callback` registration; environment providers continue to use `OIDC_REDIRECT_URI`. Plugin redirect methods use `/admin/sign-in/callback`.

운영 실행은 루트의 `ecosystem.config.cjs`(pm2)를 씁니다: `bun install` → `bun run --filter @cms/api db:generate` → `bun run --filter @cms/web build` → `pm2 start ecosystem.config.cjs` (API :4000, 웹 :3000, 둘 다 기본 `127.0.0.1`에서만 수신 — 앞에 https 리버스 프록시를 둡니다). `.env`는 필요 없습니다.

웹 빌드는 `../board`처럼 **릴리스로 승격**합니다. `bun run --filter @cms/web build`는 `vite build` 뒤에 `apps/web/scripts/release.js`를 실행해 `build/`를 `apps/web/.web-releases/<내용 해시>/`로 복사하고 `.active-web-release`가 그것을 가리키게 합니다. `server.js`는 활성 릴리스에서 시작하므로, 다시 빌드해도 실행 중인 서버의 파일은 바뀌지 않습니다(새 릴리스는 `pm2 restart cms-web`부터). 12시간 안에 물러난 릴리스의 해시된 브라우저 에셋은 남아 있는 릴리스에 하드 링크로 이어 붙여 이미 열린 페이지도 스크립트를 불러오고, 그보다 오래된 릴리스는 다음 승격 때 지웁니다. 압축(.br/.gz)은 만들지 않습니다(리버스 프록시가 압축). `server.js`는 `X-Forwarded-Proto`가 없는 직접 연결에 실제 스킴을 채워, http로 접속해도 폼 전송이 CSRF 검사(403)에 막히지 않습니다. 리버스 프록시는 `X-Forwarded-Proto`를 넘겨야 합니다.

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

Hourly maintenance re-seals stored TOTP secrets with the current `SecretBox` key and logs `resealed`, `unreadable`, and `skipped` counts; nonzero unreadable/skipped counts also warn. Keep `CMS_SECRET_KEY_PREVIOUS` on every instance until unreadable rows are recovered, skipped rows are revisited, and pending enrollments finish or expire. Successful TOTP verification also re-seals while atomically consuming its time step.

**`.env` 없이 운영할 수 있어야 합니다(WordPress의 `wp-config.php`처럼 선택 사항).** 사이트 운영에 필요한 설정은 모두 관리자 화면에 있습니다: DB 접속(설치 마법사), 메일, 캡챠·속도 제한, 싱글 사인온, Meilisearch, 페이지 캐시(설정 → 읽기) 등. 새 설정을 추가할 때도 env 전용으로 만들지 말고 `settings`에 저장하는 관리자 설정으로 만듭니다(비밀 값은 `SecretBox`로 봉인). 환경변수는 기본값을 바꾸는 **선택적 재정의**로만 둡니다.

- `bun run --filter @cms/web start`(`apps/web/server.js`)는 업로드를 위해 `BODY_SIZE_LIMIT`을 기본 64MB로 두되, 훅이 일반 폼 64KB·콘텐츠 2MB·플러그인 6MB·WXR 17MB로 먼저 제한합니다. API JSON은 기본 512KB(공개 인증·댓글 32KB, 콘텐츠 1MB), WXR은 16MB입니다.
- 웹 시작 시 루트 `.env`를 읽은 뒤 DB 주소·API 비밀 키·OIDC 클라이언트 비밀 같은 API 전용 변수를 제거하고 앱을 불러옵니다. 웹 런타임에는 `WEB_*`, `CMS_API_URL`, 방문자 증명 비밀 등 필요한 값만 남아야 합니다.
- 비밀 키는 자동입니다. `CMS_SECRET_KEY`가 없으면 `apps/api/data/secret.key`를 만들어 씁니다(DB와 함께 백업; API 인스턴스가 여러 개면 같은 값을 공유). 키를 바꿀 때는 모든 인스턴스에 새 `CMS_SECRET_KEY`와 이전 `CMS_SECRET_KEY_PREVIOUS`를 함께 설정합니다. 이전 키를 없애기 전에 대기 중인 잡을 모두 처리하고 저장된 비밀 값을 관리자 화면에서 다시 입력해 저장(웹훅 비밀은 회전)하세요.
- 비밀번호 재설정·가입·초대 링크를 포함한 이메일 잡 본문은 `SecretBox`로 봉인해 저장합니다. 최종 실패한 잡은 본문을 즉시 지우되, 키가 달라 열 수 없는 암호문은 키 복구를 위해 보존하고 매시간 다시 확인합니다. 기존 실패 잡의 평문도 유지보수 작업이 회당 500개씩 지웁니다. 실패 기록은 30일 뒤 정리합니다.
- **이메일 잡 형식 업그레이드는 롤링 배포하지 않습니다.** 이전 API 프로세스를 모두 중지한 뒤 새 버전을 모두 시작하세요. 새 프로세스는 기존 평문 잡을 읽지만, 이전 프로세스는 새 암호화 봉투를 읽지 못합니다. 이전 버전으로 되돌리기 전에는 새 버전으로 암호화 잡을 비우거나 새 리더를 유지해야 합니다.
- 웹↔API 방문자 증명 비밀은 비밀 키에서 파생되며, 관리자가 로그인하면 웹 서버가 `GET /api/v1/admin/frontend-secret`으로 받아 `apps/web/data/frontend.secret`(0600)에 보관합니다. 그 전까지 방문자는 공용 할당량을 나눠 씁니다. 두 서버에 같은 `CMS_FRONTEND_SECRET`(32자 이상)을 두면 이 과정을 건너뜁니다.
- 브라우저 푸시(설정 → 토론 `pushNotifications`)의 VAPID 키 쌍(P-256)은 처음 필요할 때 한 번 만들어 설정 키 `push.vapid`에 저장합니다. 생성은 `push.vapid` 설정 행 잠금 안에서 하므로 인스턴스가 여러 개여도 한 쌍만 생깁니다. 공개 키만 API 밖으로 나가고(`notifications.push`, `GET /api/v1/admin/push-subscription`), 개인 키는 `SecretBox`로 봉인됩니다. 비밀 키를 이전 키 없이 바꾸면 개인 키를 열 수 없어 푸시 발송 잡이 실패합니다(`PushKeyUnreadable` 로그). 키 쌍을 지우면 새 쌍이 생기고 기존 브라우저 구독은 모두 403으로 무효 처리되어 다시 구독해야 합니다. VAPID `sub`는 사이트 주소가 `https://`이면 그 origin, 아니면 첫 관리자 이메일(`mailto:`)입니다.
- 푸시 발송은 방문자가 준 엔드포인트로 나가므로 허용 목록(`PUSH_SERVICE_HOSTS`: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`; https, 포트 443, 자격 증명·프래그먼트 없음)을 등록할 때와 보낼 때 모두 확인하고, DNS를 고정하는 egress 전송(서비스 지정 없음 = 공인 주소만, 사설 주소 규칙은 적용되지 않음)으로 보내며 리디렉션을 따르지 않습니다(3xx는 영구 실패). 아웃바운드 방화벽이 있으면 위 호스트의 443 포트를 열어야 합니다.
- TOTP 비밀은 봉인되어 저장되며, 검증에 성공하면 시간 단계를 소비하면서 현재 키로 원자적으로 다시 봉인합니다. 키를 교체할 때는 모든 인스턴스에 현재·이전 키를 일관되게 설정하고, 이전 키를 없애기 전에 TOTP 재봉인 유지보수 작업을 실행하세요. 읽을 수 없거나 건너뛴 레코드는 해결하고, 대기 중인 등록은 끝나거나 만료되게 둡니다. (Passkey 주의사항: [sign-in](auth/sign-in.md#passkeys-and-totp))
- 선택적 재정의(루트 `.env.example`): `DATABASE_URL`, `API_PORT`/`API_HOST`, `WEB_PORT`/`WEB_HOST`, `CMS_API_URL`, `MEDIA_DIR`/`PLUGINS_DIR`(인스턴스가 여러 개면 공유 저장소), `MEDIA_MAX_MB`, `SESSION_TTL_HOURS`, `PLUGIN_TIMEOUT_MS`, `SCHEDULER_INTERVAL_MS`, `CMS_EGRESS_ALLOWLIST`, `OIDC_*`(서버에서 SSO를 고정할 때; 있으면 관리자 SSO 설정보다 우선).
