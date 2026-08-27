# 브라우저 테스트 — 환경과 규약

`docs/USE_CASES.md` 의 유즈케이스를 **실제 브라우저에서 돌려 확인하는** 방법이다.
시나리오별 절차는 `docs/BROWSER_TEST_CASES.md` 에 있고, 이 문서는 그 앞의 준비와
전체에 걸친 규약을 다룬다.

**유닛 테스트(`npm run test`)를 대신하지 않는다.** 유닛은 순수 함수의 판정을 고정하고,
이 문서는 그 함수들이 브라우저·Storage·Inngest·LLM 을 거쳐 화면에 닿는 경로를 본다.
지금까지 이 경로에서만 드러난 결함이 여럿이다 — 번들러가 `process.env` 동적 접근을
치환하지 않아 클라이언트 Supabase 가 늘 실패하던 것이 대표적이고, 유닛 테스트는
Node 의 진짜 `process.env` 위에서 돌아 끝내 통과했다.

---

## 빠른 시작

준비가 이미 끝난 상태라면 세 줄이다.

```bash
scripts/browser-test/up.sh                 # 서버·Inngest·픽스처·쿠키
scripts/browser-test/actor.sh u3           # 액터 상태 지정
# 그다음 BROWSER_TEST_CASES.md 의 시나리오를 실행
```

처음이라면 아래 "환경 구성"을 한 번 거쳐야 한다.

---

## 환경 구성 (최초 1회)

### 1. 로컬 Supabase

프로덕션 DB 에 테스트 데이터를 쌓지 않는다. 계정 삭제(S27)나 데이터 정리처럼
되돌릴 수 없는 시나리오가 있어서다.

```bash
npx supabase start
npx supabase db reset       # 마이그레이션 전부 적용
npx supabase status         # anon key · service_role key 를 여기서 얻는다
```

### 2. `.env.local`

`.env` 는 프로덕션을 가리킨다. `.env.local` 로 덮어쓴다 (`.gitignore` 의 `.env.*` 대상이라
커밋되지 않는다).

```bash
cat > .env.local <<'EOF'
# 브라우저 테스트용 로컬 오버라이드. 지우면 프로덕션으로 되돌아간다.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<npx supabase status 의 anon key>
SUPABASE_SERVICE_ROLE_KEY=<npx supabase status 의 service_role key>

# 없으면 .env 의 INNGEST_EVENT_KEY 때문에 이벤트가 프로덕션 Cloud 로 나간다.
INNGEST_DEV=1
INNGEST_BASE_URL=http://127.0.0.1:8288

# Polar 웹훅 서명 검증용. 아무 문자열이나 되지만 비워 두면 안 된다(아래 함정 참조).
POLAR_WEBHOOK_SECRET=<임의의 난수 문자열>
EOF
```

`OPENAI_API_KEY` 는 `.env` 값을 그대로 쓴다. **분류와 신호 서술에서 실제 API 를
호출하므로 비용이 든다.** 업로드 한 건당 가맹점 배치 1회 + 신호 서술 1회다.

### 3. 테스트 유저

구글 OAuth 는 자동화할 수 없다. 이메일·비밀번호 유저를 직접 만들고 세션 쿠키를 심는다.

```bash
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)
curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"e2e-test@finsight.local","password":"e2e-test-pw-1234","email_confirm":true}'
```

**`profiles` row 는 앱이 `/auth/callback` 에서만 만든다.** 위 경로로 만든 유저에게는
없으므로 직접 넣는다.

```bash
docker exec supabase_db_part2_project_finsight psql -U postgres -d postgres -c "
  insert into public.profiles (user_id, trial_started_at, subscription_status)
  select id, now(), 'trialing' from auth.users where email = 'e2e-test@finsight.local'
  on conflict (user_id) do nothing;"
```

### 4. dev-browser

```bash
npm install -g dev-browser && dev-browser install
```

---

## 실행 규약

### 스크립트를 실행하는 방법

dev-browser 는 QuickJS 샌드박스라 `import` 가 없다. 공용 헬퍼는 `prelude.js` 에 두고
**실행할 때 이어 붙인다.**

```bash
{ cat scripts/browser-test/prelude.js; cat <<'EOF'
const page = await auth();
const text = await upload(page, "base-2026-06.csv", "카드 1");
console.log(text.slice(0, 600));
EOF
} | dev-browser --browser finsight
```

`--browser finsight` 는 이름 붙은 브라우저를 재사용해 매번 새로 띄우지 않게 한다.

### 프렐류드가 주는 것

| 함수 | 하는 일 |
|---|---|
| `auth(name?)` | 세션 쿠키를 심은 페이지를 준다. **스크립트마다 부른다** (쿠키가 20~30분이면 끊긴다) |
| `go(page, path, ms?)` | 이동 + 안정화 대기 |
| `textOf(page, path, ms?)` | 이동해서 `body.innerText` 를 준다 |
| `dash(page, ms?)` | `/dashboard` 의 텍스트 |
| `openDialog(page, card?)` | 업로드 다이얼로그를 열고 카드까지 고른다 |
| `setCard(page, label)` | 카드 선택. 목록에 없으면 "새 카드 추가"로 만든다 |
| `attach(page, fixture, content)` | 파일 input 에 File 을 주입 |
| `attachBase64(page, name, b64)` | 비 UTF-8 파일(EUC-KR 등)을 바이트 그대로 주입 |
| `submit(page, ms?)` | 업로드 제출 |
| `upload(page, fixture, card?, ms?)` | 다이얼로그 → 붙이기 → 제출을 한 번에. 결과 텍스트를 준다 |
| `attachOnly(page, fixture, card?, mime?)` | 제출하지 않고 다이얼로그의 거부 문구만 본다(S16) |
| `shot(page, name)` | 스크린샷을 `~/.dev-browser/tmp/<name>` 에 저장 |

픽스처는 이름만 넘긴다 — `up.sh` 가 `test/fixtures/csv/` 를 `~/.dev-browser/tmp/` 로
복사해 두고, `readFile` 이 거기서 읽는다.

### 액터 만들기

**U4(체험 만료)와 U6(해지)는 앱을 써서 도달할 수 없다.** `entitlement.ts` 는
`subscription_status` 컬럼이 아니라 `trial_started_at + 7일` 과 `current_period_end` 를
매 요청 계산하므로, 그 두 값을 옮겨야 한다.

```bash
scripts/browser-test/actor.sh u4
```

| 인자 | 만드는 상태 | 쓰는 곳 |
|---|---|---|
| `u2` `u3` | `trialing`, 체험 시작 1일 전 (6일 남음) | 대부분의 시나리오 |
| `u4` | `trialing`, 체험 시작 30일 전 → **expired** | S18 · S19 · S20 · S30 · S32 · S35 · S36 · S38 |
| `u5` | `active`, 기간 20일 남음 | S8 · 쓰기 전반 |
| `u6` | `canceled`, 기간 10일 남음 → **권한은 u5 와 같다** | S8 이후 상태 확인 |
| `u6x` | `canceled`, 기간 지남 → **expired** | 해지 후 만료 경계 |
| `trial-ending` | `trialing`, 6일 전 시작 (1일 남음) | 만료 2일 전 예고 배너 |

U1(비로그인)은 DB 상태가 아니다 — `auth()` 를 부르지 않으면 U1 이다.
U2(거래 0건)와 U7(복귀자)은 권한이 아니라 **데이터 상태**라 `reset.sh` 와 함께 만든다.

### 데이터 정리

```bash
scripts/browser-test/reset.sh jobs    # 실패·대기 job 만 (대시보드 카드를 비운다)
scripts/browser-test/reset.sh data    # 거래·신호·리포트·업로드 전부 → U2 상태
scripts/browser-test/reset.sh cache   # 이 유저의 CSV 형식 fingerprint 만
```

`reset.sh cache` 를 따로 둔 이유: `csv_format_fingerprints` 는 **개인 범위 캐시**라
같은 헤더를 두 번째 올리면 컬럼 매핑 LLM 을 부르지 않는다. 자동 매핑 추론 자체를
다시 보려면(S9) 이 캐시를 지워야 한다.

**전역 캐시 `merchant_categories` 는 어느 모드에서도 지우지 않는다.** 사용자 데이터가
아니고, 지우면 이후 업로드마다 분류 LLM 비용이 다시 든다.

---

## 판정 규약

시나리오마다 **화면 판정**과 **DB 판정**을 나눠 적는다. 둘 중 하나만 보면 놓치는 것이 있다.

- **화면만 보면 놓치는 것** — S24 는 카드별로 같은 거래가 둘 다 남아야 하는데 화면에는
  숫자만 뜬다. S27 은 개인 데이터를 지우되 전역 캐시는 남겨야 하는데 화면에 그 구분이 없다.
- **DB만 보면 놓치는 것** — 상태가 맞아도 문구가 기술 용어이거나(S14), 버튼이 사라져
  다음 행동을 할 수 없는 경우가 있다(S10).

**"통과"는 두 판정을 모두 만족했을 때만 쓴다.** 하나만 확인했으면 그렇게 적는다.

### 분류 결과에 기대지 않는다

카테고리는 LLM 이 정하므로 실행마다 달라질 수 있다. 신호 시나리오(S28~S36)의 판정은
**"카테고리 이름이 무엇인가"가 아니라 "신호 타입이 잡혔는가"와 "payload 수치가 SQL
집계와 일치하는가"** 로 잡는다. 후자가 실제로 지켜야 할 규칙이기도 하다 —
`CLAUDE.md` 는 리포트와 AI 리뷰의 모든 수치가 SQL 집계 결과여야 한다고 못 박는다.

가맹점이 `merchant_categories` 전역 캐시에 있으면 LLM 을 부르지 않고 그 값을 쓴다.
그래서 같은 픽스처를 반복하면 재현성이 올라간다.

---

## 함정

이 절의 항목은 전부 실제로 한 번씩 시간을 버린 것들이다.

**`waitUntil: "networkidle"` 을 쓰지 마라.** `pending` 에 갇힌 job 이 하나라도 있으면
진행률 카드가 계속 폴링해 networkidle 이 영영 오지 않는다(`KNOWN_ISSUES` ⓒ).
스크립트가 30초에 죽는다. 프렐류드의 `go()` 는 `domcontentloaded` 를 쓴다.

**dev-browser 스크립트에는 30초 제한이 있다.** 한 스크립트에서 업로드를 두 건 이상
하면 두 번째부터 `Script timed out after 30s` 로 터진다. **업로드는 한 스크립트에
한 건씩** 넣고, 여러 건은 셸 루프로 스크립트를 반복 호출한다. 터졌더라도 제출 자체는
이미 갔을 수 있으니 `upload_jobs` 를 먼저 확인하고 다시 올린다.

**`npm run build` 는 실행 중인 dev 서버의 `.next` 를 깨뜨린다.** `MODULE_NOT_FOUND` 와
`_next/static/*` 404 가 쏟아지고 페이지가 빈 화면이 된다. 앱 버그가 아니다.
빌드 전에 dev 서버를 내린다.

**Claude Code 로 테스트한다면 이 일이 매 턴 자동으로 일어난다.** `.claude/settings.json` 의
`Stop` 훅이 턴이 끝날 때마다 `npm run lint && npm run build && npm run test` 를 돌린다.
그 `build` 가 실행 중인 dev 서버의 `.next` 를 덮어쓴다. 브라우저 테스트를 길게 할 때는
**턴이 바뀔 때마다 `up.sh` 로 다시 세우거나**, 그 세션 동안 Stop 훅을 잠시 꺼라.
증상이 `up.sh` 의 `✗ /api/inngest 가 dev 모드가 아니다 ()` 로 나타나는 것도 이 때문이다 —
Inngest 설정이 틀린 게 아니라 라우트가 500 을 내서 응답이 비어 있는 것이다.

이미 깨졌다면 — 증상은 `Cannot find module './873.js'` 와 대시보드 **500** 이고,
브라우저 스크립트에서는 버튼을 못 찾아 `Script timed out after 30s` 로 나타난다.
복구는 셋뿐이다.

```bash
kill $(lsof -ti :3000 -sTCP:LISTEN)        # dev 서버를 내린다
mv .next /tmp/next-broken-$(date +%s)      # rm -rf 는 PreToolUse 훅이 막는다
scripts/browser-test/up.sh                 # 다시 세운다
```

재기동 뒤 **첫 요청은 컴파일 때문에 느리다.** 곧바로 업로드 스크립트를 돌리면 30초에
걸리므로, 대시보드를 한 번 열어 컴파일을 끝낸 다음 진행한다.

**Inngest dev 서버는 `npm run dev` 를 kill 하면 같이 죽는다.** dev 를 재시작할 때마다
`up.sh` 를 다시 돌린다. 동기화(`curl -X PUT /api/inngest`)를 빠뜨리면 업로드가
`pending` 에서 멈추고 원인이 화면에 안 보인다.

**세션 쿠키가 20~30분이면 끊긴다** (`jwt_expiry` 는 3600 인데도). 스크립트마다
`auth()` 를 부르고, 그래도 401 이 보이면 `up.sh` 를 다시 돌린다.

**`setInputFiles(경로)` 는 죽는다.** QuickJS 에는 `fs` 가 없다. `attach()` 처럼
`page.evaluate` 안에서 `new File()` + `DataTransfer` 로 넣어야 한다.

**EUC-KR 파일을 `readFile` 로 읽으면 깨진다.** base64 로 저장해 두고 `attachBase64()` 로
넣는다(`euckr.csv.b64`).

**업로드 버튼이 안 보이면 `expired` 인지부터 본다.** 만료 상태에서는 "명세서 올리기"
자리가 "결제하고 계속 쓰기"로 바뀐다. 고장이 아니라 S18 의 정상 동작이다.
`actor.sh u3` 로 되돌린다.

**로컬 `.env` 의 `POLAR_*` 가 빈 문자열이면 서명 검증 전에 500 이 난다.**
`getRequiredEnv` 가 먼저 던지기 때문이다. 웹훅에서 401 대신 500 이 보이면 이걸 의심한다.

**`rm -rf` 는 이 프로젝트의 `PreToolUse` 훅이 막는다** (`.claude/settings.json`).
훅을 우회하지 말고 `.next` 는 다른 곳으로 `mv` 한다.

---

## 알려진 결함은 실패가 정상이다

`docs/KNOWN_ISSUES.md` 에 적힌 9건(ⓐ~ⓘ)은 아직 고치지 않았다. 해당 시나리오에는
`BROWSER_TEST_CASES.md` 가 표시를 달아 두었다. **그 시나리오가 그 방식으로 실패하는
것은 새 결함이 아니다.** 다르게 실패하면 그때 보고한다.

특히 ⓑ 는 **모든 업로드에** "구분되지 않아 이 형식으로 가정했습니다" 를 붙인다.
S34 를 볼 때 이 문구가 떴다고 판별이 실패한 것이 아니다.

---

## 픽스처

`test/fixtures/csv/` 에 있다. 어떤 시나리오가 무엇을 쓰는지는
`BROWSER_TEST_CASES.md` 각 절에 적혀 있다.

**날짜는 고정 과거로 박았다.** 상대 날짜로 만들면 매번 파일이 달라져 `dedupe_key`
충돌(S15)이나 형식 캐시(S9)를 재현할 수 없다. 두 파일만 예외다.

| 파일 | 왜 특별한가 |
|---|---|
| `future-dates.csv` | 미래 날짜여야 의미가 있어 **2099년**으로 박았다. 이 픽스처는 낡지 않는다 |
| `too-old.csv` | 10년 이전이어야 해서 2005년이다. 시간이 지날수록 더 확실해진다 |

`base-2026-04/05/06/07.csv` 는 **한 세트다.** 순서대로 올려야 반복 결제(3회)와
구독료 인상, 카테고리 급증이 성립한다. 하나만 올리면 신호가 `outlier_transaction`
하나뿐이다 — 그게 필요하면 `single-month.csv` 를 쓴다.

---

## 관련 문서

| 문서 | 무엇 |
|---|---|
| `docs/BROWSER_TEST_CASES.md` | 시나리오별 실행 절차와 판정 |
| `docs/USE_CASES.md` | 유즈케이스 42건 (액터·화면) |
| `docs/USER_FLOW.md` | 화면·상태·문구의 단일 출처. **어긋나면 이쪽이 맞다** |
| `docs/KNOWN_ISSUES.md` | 아직 고치지 않은 결함 9건 |
