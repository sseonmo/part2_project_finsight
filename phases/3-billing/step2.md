# Step 2: account-settings

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ADR.md` — **ADR-009 전문이 이 step 의 핵심이다.** "**계정 삭제가 원본의 유일한 삭제 경로다. 삭제 크론이 없으므로 이 코드에 대체재가 없다. 구현하지 않으면 보관 정책이 그대로 '영구 보관'이 된다**"
- `/docs/ARCHITECTURE.md` — "백그라운드" 마지막 문단("계정 삭제 시 DB row 와 함께 `{user_id}/` 하위 Storage 객체를 전부 지운다") · "데이터 모델"
- `/docs/USER_FLOW.md` — **S8(해지) · S27(계정 삭제)** · "화면" 표의 `/settings` 행 · "요금제는 앱 안에도 화면을 둔다"(`/settings` 는 이미 구독 중인 사용자의 상태·해지를 다룬다)
- `/docs/DESIGN.md` — "danger"(파괴적 동작에만, 테두리 있는 버튼, 채움 없음. **계정 삭제는 색만으로 경고하지 않고 되돌릴 수 없음을 문장으로 밝히고 재확인을 받는다**)
- `/AGENTS.md` — 외부 API 호출은 라우트 핸들러에서만 · entitlement 판정은 서버 유틸 한 곳

이전 step 에서 만들어진 아래 파일을 **전부 읽고 시그니처를 확인한 뒤** 작업하라:

- `src/services/polar.ts` — `createCustomerPortalSession({ polarCustomerId })`
- `src/app/api/webhooks/polar/route.ts` — `polar_customer_id` 를 언제 `profiles` 에 채우는지 확인하라
- `src/app/api/uploads/[id]/route.ts` — `DELETE` 가 Storage 객체를 지우는 방식(버킷 이름·`remove` 호출 형태)
- `src/services/supabase-service-role.ts` — `createServiceRoleClient()`
- `src/lib/session.ts` · `src/lib/entitlement.ts`
- `src/components/Button.tsx`(`variant="danger"`) · `Badge.tsx`
- `src/middleware.ts` — `/settings` 가 이미 로그인 보호 대상이다
- `supabase/migrations/20260817072000_init.sql` — 전 테이블이 `auth.users(id)` 에 `on delete cascade` 로 걸려 있는지 확인하라

## 작업

### 1. `POST /api/billing/portal` — 해지·결제수단 관리 포털

- 로그인 확인 → `profiles.polar_customer_id` 를 읽고 → `createCustomerPortalSession` → `{ portalUrl }` 반환
- `polar_customer_id` 가 없으면(아직 결제한 적 없음) 409 로 안내하고 요금제 화면으로 보낸다
- **해지를 이 앱에서 직접 처리하지 마라.** 해지는 Polar 포털에서 일어나고, 그 결과는 웹훅으로 돌아온다 (S8). 여기서 `subscription_status` 를 직접 바꾸면 서명 검증을 우회하는 경로가 생긴다
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 먼저 작성하라

### 2. `DELETE /api/account` — 계정 삭제

**순서가 이 라우트의 전부다. 아래 순서를 바꾸지 마라.**

1. 로그인 확인. **본인 계정만 지운다** — 대상 `user_id` 를 요청 본문에서 받지 마라
2. 재확인 값 검증 — 클라이언트가 보낸 확인 문자열이 정확하지 않으면 400
3. **Storage 객체를 먼저 전부 지운다.**
   - 대상은 `{user_id}/` 하위 전부다. `upload_jobs.storage_key` 목록과 **Storage 의 `{user_id}/` prefix 나열 결과를 합쳐서** 지워라. DB row 없이 남은 고아 객체도 함께 잡힌다
   - **DB 를 먼저 지우면 `storage_key` 목록을 잃고 원본 CSV 가 영구히 남는다.** 삭제 크론이 없으므로 그 파일들에는 두 번째 기회가 없다 (ADR-009)
   - Storage 삭제가 실패하면 **거기서 멈추고 5xx 를 반환한다.** DB 를 지우고 파일을 남기지 마라
4. Storage 삭제가 확인된 뒤 **service role 로 `auth.users` 의 사용자를 삭제한다.** 전 사용자 테이블이 `auth.users(id)` 에 `on delete cascade` 로 걸려 있어 DB row 는 함께 사라진다. **테이블마다 `delete` 를 직접 호출하지 마라** — 새 테이블이 늘 때 빠뜨린다
5. 세션을 종료하고 랜딩으로 보낸다

- **entitlement 게이트를 걸지 마라.** `expired` 사용자도 자기 계정을 지울 수 있어야 한다. 데이터를 인질로 잡는 제품은 결제가 아니라 탈퇴를 부른다 (ADR-005 의 취지)
- **`route.ts` 는 TDD Guard 검사 대상이다.** `route.test.ts` 를 **먼저** 작성하라:
  - Storage 삭제가 `auth.users` 삭제보다 **먼저** 호출된다 (호출 순서를 단언하라)
  - Storage 삭제가 실패하면 `auth.users` 삭제가 호출되지 않는다
  - 요청 본문의 `userId` 가 무시되고 세션 사용자만 지워진다
  - 재확인 문자열이 틀리면 400 이고 아무것도 지우지 않는다

### 3. `/settings` 화면

- **계정** — 이메일, 가입일
- **구독 상태** — `entitlement.state` 로 렌더한다. **`subscription_status` 문자열을 직접 비교하지 마라** (AGENTS.md CRITICAL)
  - 체험 중 → 남은 일수와 종료일
  - 구독 중 → 다음 결제일(`current_period_end`)
  - 해지했고 기간이 남음 → **"○월 ○일까지 이용할 수 있습니다"** (S8). "구독이 종료되었습니다" 라고 쓰지 마라 — 아직 아니다
  - 만료 → 읽기 전용임을 밝히고 요금제로 보낸다
- **구독 관리** — `POST /api/billing/portal` 로 포털을 연다. 결제한 적 없는 사용자에게는 요금제 링크
- **계정 삭제** — `Button variant="danger"`(테두리만, 채움 없음)
  - **되돌릴 수 없음을 문장으로 밝히고 재확인을 받는다** (S27 · DESIGN "danger"). 색과 아이콘만으로 경고하지 마라
  - 무엇이 사라지는지 구체적으로 적어라: 거래·신호·리포트·**업로드한 원본 CSV 파일**. 건수를 함께 보여주면 더 좋다
  - 재확인은 사용자가 문자열을 직접 입력하는 방식으로 한다. 버튼 두 번 클릭으로 끝내지 마라

## Acceptance Criteria

```bash
npm run build       # 컴파일 에러 없음
npm run lint        # 경고 0
npm test            # 계정 삭제 순서 테스트 · 포털 라우트 테스트 포함 전부 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - **Storage 삭제가 DB 삭제보다 먼저인가?** 그 순서를 단언하는 테스트가 있는가?
   - Storage 삭제 실패 시 DB 를 지우지 않고 멈추는가?
   - `{user_id}/` prefix 나열까지 포함해 고아 객체를 잡는가?
   - `auth.users` 삭제로 cascade 를 태우는가? 테이블마다 delete 를 호출하지 않는가?
   - 계정 삭제에 entitlement 게이트가 **없는가**?
   - 해지를 앱에서 직접 처리하지 않고 포털 + 웹훅으로 넘기는가?
   - 화면이 `entitlement.state` 로 렌더되고 `subscription_status` 를 직접 비교하지 않는가?
   - 삭제 재확인이 문자열 입력인가?
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? ADR 기술 스택을 벗어나지 않았는가?
   - AGENTS.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/3-billing/index.json` 의 step 2 를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (다음 step 이 알아야 할 것: `/settings` 경로와 구성, 계정 삭제·포털 라우트 경로, 추가로 필요한 환경변수)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- **DB 를 먼저 지우고 Storage 를 나중에 지우지 마라.** 이유: `storage_key` 목록을 잃어 원본 CSV 가 영구히 남는다. 삭제 크론이 없으므로 대체 경로가 없다 (ADR-009).
- **계정 삭제를 entitlement 로 막지 마라.** 이유: 만료 사용자가 자기 데이터를 지울 수 없으면 데이터를 인질로 잡는 제품이 된다.
- **대상 `user_id` 를 요청 본문에서 받지 마라.** 이유: 남의 계정을 지울 수 있다.
- **테이블마다 `delete` 를 나열하지 마라.** 이유: 새 테이블이 늘 때 빠뜨린다. cascade 가 이미 걸려 있다.
- **앱에서 `subscription_status` 를 직접 바꾸지 마라.** 이유: 해지·재결제의 유일한 반영 경로는 서명 검증을 통과한 웹훅이다. 앱이 상태를 쓰면 그 검증을 우회하는 경로가 생긴다.
- **원본 CSV 자동 삭제 크론을 만들지 마라.** 이유: 보관 정책은 계정 삭제까지다 (ADR-009).
- **삭제를 되돌릴 수 있다고 암시하거나 유예 기간을 만들지 마라.** 이유: 요구에 없고, 유예를 두면 그것을 청소할 크론이 다시 필요해진다.
- **랜딩·파비콘·배포 설정을 건드리지 마라.** 이유: 다음 step 의 몫이다.
- 기존 테스트를 깨뜨리지 마라.
- 커밋하지 마라. execute.py 가 처리한다.
