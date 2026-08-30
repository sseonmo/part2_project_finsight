# Polar 결제 설정 — sandbox

결제 **코드는 이미 다 있다.** 체크아웃(`src/app/api/billing/checkout`), 고객 포털
(`.../billing/portal`), 웹훅(`.../webhooks/polar`), SDK 래퍼(`src/services/polar.ts`)까지
테스트와 함께 들어와 있다. 이 문서는 그 코드가 실제로 돌게 만드는 **외부 설정**만 다룬다.

전 구간을 로컬에서 실측한 절차다(2026-08-30). 시나리오 형태는 `BROWSER_TEST_CASES.md` 의
S7 에 있다.

> **production 조직은 아직 없다.** 지금 설정은 전부 sandbox(`sandbox.polar.sh`)다.
> 실결제를 켜려면 Polar 계정 인증을 통과하고 production 조직에 제품을 다시 만들어야 한다.

---

## 지금 무엇이 설정돼 있나

| 항목 | 값 |
|---|---|
| sandbox 조직 | `sseon` (`2e8bfc82-01b7-442b-986c-b1cc0aee1015`) |
| 제품 · 월간 | `96d9aeef-1407-4d91-9ce1-da00fb6f07c8` — ₩4,900 / month |
| 제품 · 연간 | `ef0991b2-71fd-4d64-8fd2-6740c07f323b` — ₩49,000 / year |
| 웹훅 · 프로덕션 | `https://part2-project-finsight.vercel.app/api/webhooks/polar` |
| 웹훅 · 로컬 | ngrok URL (터널을 새로 띄울 때마다 바꿔야 한다) |
| 토큰 | `finsight-sandbox`(Vercel 용) · `finsight-local`(로컬용) |

조직 설정의 Country·Website·Support Email 은 **비어 있어도 sandbox 제품 생성과 결제가
된다.** 실측으로 확인했다.

---

## 환경변수

`src/services/polar.ts` 가 읽는 이름은 다섯 개다. 하나라도 비어 있으면 `getRequiredEnv`
가 먼저 던져서 **서명 검증 전에 500** 이 난다.

```bash
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_SERVER=sandbox              # sandbox | production 이외 값은 거부된다
POLAR_WEBHOOK_SECRET=whsec_...    # 엔드포인트마다 다르다
POLAR_PRODUCT_ID_MONTHLY=...
POLAR_PRODUCT_ID_YEARLY=...
```

`POLAR_PRODUCT_ID`(단수)는 코드가 읽지 않는다. 옛 `.env` 에 그 이름이 남아 있었고,
그래서 값이 있어도 체크아웃이 되지 않았다.

---

## 1단계 — 제품

`sandbox.polar.sh` → 조직 → Products → New Product.

- Name: `FinSight 월간` / `FinSight 연간`
- Pricing: **Recurring subscription** — `Every 1 month` / `Every 1 year`
- Currency **KRW**, Fixed price `4900` / `49000`
- Free trial period는 **끈다.** 체험은 앱이 `profiles.trial_started_at` 으로 직접 계산한다

만든 뒤 목록에서 `⋯` → `Copy Product ID`.

> 폼이 다 뜨기 전에 입력하면 값이 조용히 초기화된다. `Create Product` 를 눌렀는데 화면이
> 그대로면 **다시 누르지 마라** — 실제로는 생성돼 중복이 된다. 목록을 새로고침해 확인하고,
> 중복은 `⋯` → `Archive Product` 로 치운다.

## 2단계 — 액세스 토큰

Settings → Developers → `Create token`.

필요한 스코프는 코드가 부르는 두 개뿐이다.

- `checkouts:write` — `checkouts.create`
- `customer_sessions:write` — `customerSessions.create`

확인용으로 `products:read`·`subscriptions:read` 를 더해두면 편하다.

> **토큰은 생성 직후 한 번만 보인다.** 만료가 기본 `Never expires` 로 잡히는 경우가 있으니
> 목록에서 확인하고, 임시 토큰이면 쓰고 나서 `Revoke` 한다.

## 3단계 — 웹훅

Settings → Webhooks → `Add Endpoint`.

- URL: `<앱 주소>/api/webhooks/polar`
- Format: **Raw** (Discord·Slack 은 우리 라우트가 파싱하지 못한다)
- Events: **구독 6종만** 켠다 — `subscription.created` · `active` · `uncanceled` ·
  `canceled` · `revoked` · `updated`

이 6종이 `resolveBillingState()` 가 처리하는 전부다. `cycled`·`past_due`·`paused`·
`resumed` 는 켜도 200 `ignored` 로 버려지므로 켜지 않는다.

만든 뒤 `Copy Secret` 으로 시크릿을 가져와 `POLAR_WEBHOOK_SECRET` 에 넣는다.
**눈으로 옮겨 적지 마라** — `I`/`l`, `0`/`O` 가 섞여 있어 틀리기 쉽고, 틀리면 401 만 보인다.

```bash
# macOS: 클립보드에서 바로 넣는다
S=$(pbpaste); case "$S" in whsec_*) echo ok;; *) echo "클립보드가 시크릿이 아니다"; esac
```

### 로컬에서 받으려면

Polar 는 `localhost` 로 보내지 못하므로 터널이 필요하다. **ngrok 무료 계정이 주는
dev domain 을 쓴다** — 고정이라 Polar 에 한 번만 등록하면 된다. 임의 URL 로 띄우면
재시작마다 주소가 바뀌어 매번 고쳐야 한다.

```bash
# .env.local
NGROK_DOMAIN=<계정의 dev domain>.ngrok-free.dev
```

`scripts/browser-test/up.sh` 가 이 값을 읽어 터널까지 같이 띄우고,
`scripts/browser-test/down.sh` 가 dev 서버·Inngest 와 함께 내린다. 값이 없으면 터널
없이 뜨고 결제 시나리오만 못 돌린다.

그 URL 로 **엔드포인트를 따로 하나 더** 만든다(프로덕션 것은 그대로 둔다). 시크릿은
엔드포인트마다 다르므로 `.env.local` 에는 **로컬 엔드포인트의 시크릿**을 넣는다.

> **엔드포인트가 둘이면 이벤트는 양쪽 모두로 간다.** 같은 조직에 등록된 이상 로컬에서
> 한 테스트 결제가 프로덕션 앱으로도, 프로덕션 결제가 로컬로도 전송된다. 받는 쪽에
> 그 `user_id` 가 없으므로 **500 이 쌓이고 Polar 가 재시도한다.** 데이터가 섞이지는
> 않는다 — 웹훅 라우트가 `metadata.user_id` 로만 프로필을 찾고 없으면 거부하기
> 때문이다. 쌓이는 500 이 싫으면 **쓰지 않는 쪽 엔드포인트를 `Enabled` 토글로 꺼 둔다.**

---

## 4단계 — 검증

`BROWSER_TEST_CASES.md` 의 **S7** 을 그대로 돌린다. 요약하면:

1. `/api/billing/checkout` 이 200 과 `checkoutUrl` 을 준다
2. 그 URL 에서 결제한다 — KRW 라 한국 결제수단이 뜨고, 고르면 Stripe **테스트 시뮬레이터**의
   `AUTHORIZE TEST PAYMENT` 버튼이 나온다. 카드번호를 넣는 곳이 아니다
3. 웹훅 3건(`created`→`active`→`updated`)이 들어오고 `profiles` 가 `active` 가 된다
4. Polar 대시보드에서 `Redeliver` 해도 `processed_webhook_events` 행 수가 늘지 않는다

---

## 함정

**테스트 유저 이메일에 `.local` 을 쓰면 결제가 안 된다.** Polar 가 예약 도메인을 거부해
체크아웃이 **422** 로 떨어지는데, 앱에서는 원인이 안 보이는 **500** 으로만 나타난다.
`example.com` 도 같은 이유로 막힌다. 실재하는 TLD 를 쓴다(`e2e-test@finsight.app`).

```
value is not a valid email address:
The part after the @-sign is a special-use or reserved name that cannot be used with email.
```

**제품이 없으면 체크아웃이 조용히 실패한다.** 환경변수에 값이 들어 있어도 그 ID 의 제품이
없으면 Polar 가 422 를 주고, 역시 500 으로만 보인다. 웹훅 Deliveries 가 계속 비어 있다면
결제가 시작조차 못 한 것이니 제품부터 확인한다.

**Vercel 의 Polar 키는 sensitive 라 되읽을 수 없다.** `vercel env pull` 이 빈 문자열을
주는 것은 미설정이 아니라 마스킹이다. 값을 확인할 방법이 없으므로, 의심스러우면 지우고
다시 넣는 편이 빠르다.

**Preview 환경에도 같은 값을 넣어야 한다.** 한쪽에만 있으면 preview 배포에서만 500 이 난다.

**환경변수만 바꿨을 때 `vercel --prod` 를 쓰지 마라.** 로컬 작업 트리를 통째로 올리므로
미커밋 코드가 함께 배포된다. 기존 배포를 다시 굽는 쪽이 맞다.

```bash
npx vercel redeploy <직전 프로덕션 배포 URL>
```

**SSO 별칭 도메인은 302 다.** 외부에 등록하는 URL 은 반드시 기본 도메인
`part2-project-finsight.vercel.app` 을 쓴다(`-sseons-projects`·`-git-main-` 별칭은 막힌다).
