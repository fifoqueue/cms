# 플러그인 수명주기와 격리

상위 문서: [AGENTS.md](../../AGENTS.md)

## 수명주기 (관리자 화면에서 실시간)

```
업로드(install) → inactive ──enable──▶ active ──disable──▶ inactive ──remove──▶ (삭제)
                         ╲ 실패 시 failed (error 메시지 노출, 코어는 계속 동작)
```

- 같은 id로 다시 업로드하면 **업그레이드**이며 이전 enabled 상태·설정·KV를 유지합니다. 순서는 다음과 같습니다.
  1. 새 번들을 이전 번들 **옆에** 커밋합니다(이전 번들은 아직 지우지 않음).
  2. 상태를 저장합니다(`state.save`).
  3. 이전 버전을 비활성화합니다.
  4. 어디에서도 참조하지 않는 오래된 번들을 정리합니다.
  5. 새 버전을 활성화합니다.
- 상태 저장 중 DB 오류가 나면 결과가 확정되지 않을 수 있습니다(커밋 여부가 모호한 경우). 저장이 예외로 끝나면 이전·새 번들을 모두 보존하고 롤백이 이루어졌다고 가정하지 않습니다. 기존 런타임은 재시작 또는 재시도 전까지 유지되며, DB 항목은 항상 존재하는 번들을 가리킵니다. 남은 번들은 다음 업그레이드 성공 또는 삭제 때 정리됩니다.
- 상태는 `plugins` 테이블, 번들은 `PLUGINS_DIR/<id>/<uuid>.js` (업로드마다 새 파일명 → 캐시 없이 새 모듈 로드).
- 서버 재시작 시 `PluginHost.boot()`가 설치된 플러그인을 다시 로드하고 enabled 인 것을 활성화합니다. 로드 실패한 번들은 `failed`로 표시되고 나머지는 정상 부팅됩니다.
- 수명주기 명령은 `PluginHost` 안에서 직렬화됩니다(동시 요청 경합 없음).
- **여러 API 인스턴스**: 각 인스턴스가 10초마다 `PluginHost.reconcile()`로 `plugins` 테이블과 자신을 맞춥니다(다른 인스턴스에서 한 설치·업그레이드·켜기/끄기·삭제 반영). `PLUGINS_DIR`은 모든 인스턴스가 같은 저장소를 봐야 하며, 로드에 실패한 번들은 바뀔 때까지 `failed`로 둡니다.

## 격리 보장 (코어를 방해하지 않기 위한 장치)

1. 모든 플러그인 호출(import, activate, deactivate, 훅, 슬롯, 라우트)은 `shared/isolate.ts`로 감싸져 **예외를 삼키고 `PLUGIN_TIMEOUT_MS`(기본 3초) 후 포기**합니다.
2. 훅 핸들러는 값의 **복사본**(`structuredClone`)을 받으므로 코어 객체를 변조할 수 없습니다.
3. 필터 결과는 코어가 검증합니다. 잘못된 값은 버리고 이전 값을 유지합니다.
4. 액션 훅은 기다리지 않습니다(fire-and-forget). 느린 플러그인이 응답을 늦추지 않습니다.
5. 활성화 중 등록된 모든 것은 `PluginScope`가 추적하고, 비활성화/삭제/활성화 실패 시 한 번에 해제합니다. 해제 후 늦게 시도한 등록(남은 타이머 등)은 거부됩니다.
6. 비활성 플러그인의 라우트는 404, 실패한 라우트는 502 입니다. 슬롯 API 실패 시 웹은 빈 슬롯으로 렌더링합니다.
7. 플러그인 데이터(설정·KV)는 `plugin_data`에 격리되며 `ON DELETE CASCADE`로 함께 삭제됩니다.

알려진 한계: 동기 무한 루프는 이벤트 루프를 막습니다(Worker 격리 필요 시 `isolate`를 교체). ES 모듈은 메모리에서 언로드되지 않습니다(등록은 모두 해제되므로 동작에는 영향 없음). **플러그인 업로드 = 서버에서 임의 코드 실행**입니다. 관리자만 가능하며, 신뢰하는 번들만 설치해야 합니다.

Plugin contexts expose only the documented published-content reader methods, not the concrete reader or its unlock/private-read APIs. Context settings/storage/content calls and task starts are revoked on disposal; already-started I/O and arbitrary JavaScript cannot be cancelled. Disposal precedes `PluginDefinition.deactivate`, so that callback cannot use context settings/storage/content APIs; it only releases independently owned resources such as timers. Pending route authorization and page form rendering must not dispatch a removed registration. Explicit invalid page/widget capabilities fail registration (only omission defaults to `plugins.manage`); actions must be own declared handlers. Authenticated plugin route responses are private and non-cacheable. `plugins.manage` is a trusted-server-code grant, not sandbox administration.
