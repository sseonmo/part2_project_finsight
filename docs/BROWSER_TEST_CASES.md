# 브라우저 테스트 — 시나리오별 절차

`docs/USE_CASES.md` 의 유즈케이스 42건을 브라우저에서 실행하는 절차다.
**환경 준비·헬퍼·함정은 `docs/BROWSER_TESTING.md` 에 있다. 그쪽을 먼저 읽는다.**

> 문구가 이 문서와 `docs/USER_FLOW.md` 사이에서 어긋나면 **`USER_FLOW.md` 가 맞다.**
> 여기 적힌 기대 문구는 실제 구현에서 뽑은 것이라, 명세와 구현이 다르면 그 자체가 결함이다.

## 표시 규칙

| 표시 | 뜻 |
|---|---|
| ✅ | **이 문서의 절차와 픽스처로 실행해 확인했다** |
| ◻︎ | 동작은 이전 세션에서 확인했으나, 여기 적힌 절차·픽스처 조합으로는 아직 안 돌렸다 |
| ⚠︎ | `docs/KNOWN_ISSUES.md` 의 결함에 걸린다. **그 방식으로 실패하는 것이 정상이다** |
| 🔍 | 화면으로 판정할 수 없어 DB 확인이 필수다 |

◻︎ 는 "틀렸다"가 아니라 "이 조합으로는 아직 안 봤다"는 뜻이다. 돌려서 맞으면 ✅ 로 바꾼다.

## 실행 틀

셸에 한 번 정의해 두고 시나리오마다 본문만 넘긴다.

```bash
run() { { cat scripts/browser-test/prelude.js; cat; } | dev-browser --browser finsight; }
psql() { docker exec supabase_db_part2_project_finsight psql -U postgres -d postgres "$@"; }
```

아래 시나리오의 `run <<'EOF' … EOF` 와 `psql -c "…"` 는 전부 이 둘을 쓴다.

## 시작 전에

```bash
scripts/browser-test/up.sh          # 서버·Inngest·픽스처·쿠키
scripts/browser-test/reset.sh data  # 깨끗한 U2 에서 시작할 때
scripts/browser-test/actor.sh u3    # 액터 지정
```

**기본 시리즈를 순서대로 올려 두면 대부분의 시나리오가 그 위에서 돌아간다.**

**업로드는 한 스크립트에 한 건씩** 넣는다. dev-browser 스크립트에는 **30초 제한**이
있어 한 스크립트에서 두 건 이상 올리면 두 번째부터 터진다. 여러 건은 셸 루프로 돈다.

```bash
for m in 04 05 06; do
run <<EOF
const page = await auth();
console.log((await upload(page, "base-2026-$m.csv", "카드 1", 15000)).slice(0, 200));
EOF
done
```

> 여기만 `<<EOF` 다(따옴표 없음). `$m` 을 셸이 치환해야 하기 때문이다.
> 나머지 블록은 전부 `<<'EOF'` — 스크립트 안의 `$` 와 백틱이 셸에 먹히면 안 된다.

**`settleMs` 는 9000 을 넘기지 마라.** 30초 제한은 스크립트 전체에 걸리고
`upload()` 는 그 앞에 대시보드 이동(2.5초)·다이얼로그·첨부를 이미 쓴다. 거래가 쌓여
대시보드가 무거워지면 15000 으로는 **제출 전에 잘려 job 이 아예 생기지 않는다**
(2026-08-27 실측 — `upload_jobs` 에 행이 남지 않는다). 워커는 제출 뒤 비동기로 도니
오래 기다릴 이유도 없다. 결과는 다음 스크립트에서 재방문해 확인한다.

---

# 1. 정상 흐름 (S1~S8)

## S1 — 첫 방문 → 가입 ✅

구글 OAuth 는 자동화할 수 없다. **랜딩이 로그인으로 보내는 데까지**만 브라우저로 보고,
`profiles` 생성은 DB 로 확인한다.

**전제** U1 (쿠키를 심지 않는다)

**본문 문자열로 판정하지 마라.** 랜딩은 마케팅 카피라 자주 바뀌고 본문이 1,600자를 넘어
`slice(0, 400)` 로는 넷째 섹션까지 가지도 못한다. 구조(heading·CTA 개수)로 본다.

```bash
run <<'EOF'
const page = await browser.getPage("anon");
await page.context().clearCookies();
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(() => ({
  h1: document.querySelector("h1")?.innerText,
  sections: [...document.querySelectorAll("h2")].map((h) => h.innerText.trim()),
  cta: [...document.querySelectorAll("button")].filter((b) => b.innerText.includes("구글로 시작하기")).length,
})), null, 1));
await page.click("text=구글로 시작하기").catch((e) => console.log("클릭 실패:", String(e).slice(0, 200)));
await page.waitForTimeout(2000);
console.log("URL:", page.url());
EOF
```

**화면 판정** `h1` 이 하나 있고, `h2` 섹션이 **세 단계로 끝납니다 · 왜 계좌를 연동하지 않나 ·
이런 문장을 받게 됩니다 · 요금제 · 월간 · 연간** 순으로 나온다(요금 카드 제목도 `h2` 다).
"구글로 시작하기" 버튼은 **4개**다 — 헤더 · 히어로 · 월간 카드 · 연간 카드.
`page.click("text=…")` 는 그중 첫 번째(헤더)를 누른다.

**⚠︎ 랜딩의 숫자를 실데이터로 읽지 마라.** 히어로 옆 대시보드 미리보기와 세 단계 카드는
`src/components/LandingStepPreview.tsx` 의 **예시 데이터**다("2026년 3월", "1,284,000원",
"식비 382,000원" 등). 로그인 전 화면이라 DB 와 아무 관계가 없다.

**URL 판정** 클릭하면 **로컬 Supabase 의 authorize 엔드포인트**로 간다.

```
http://127.0.0.1:54321/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&code_challenge=…
```

`accounts.google.com` 이 아니다 — 로컬에서는 Supabase 가 먼저 받고 거기서 구글로 넘긴다.
프로덕션에서만 `accounts.google.com/o/oauth2/…` 가 보인다.
버튼이 아무 반응도 없으면 클라이언트 Supabase 클라이언트가 죽은 것이다 — 그 결함이 실제로 있었다.

**로그인 상태 리다이렉트** 쿠키가 있으면 `/` 는 랜딩을 그리지 않고 `/dashboard` 로 보낸다.

```bash
run <<'EOF'
const page = await auth();
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
console.log("URL:", page.url());   // http://localhost:3000/dashboard
EOF
```

**DB 판정** 🔍 실제 가입까지 갔다면 `profiles` 에 `trial_started_at` 이 now 로 박힌다.

```bash
psql -c "select user_id, trial_started_at, subscription_status from profiles;"
```

---

## S2 — 첫 업로드 ✅

**전제** U2 — 거래 0건

```bash
scripts/browser-test/reset.sh data && scripts/browser-test/actor.sh u3
```

```bash
run <<'EOF'
const page = await auth();
await openDialog(page);
console.log("--- 다이얼로그 ---");
console.log(await page.evaluate(() => document.querySelector(".upload-dialog").innerText));
EOF
```

**화면 판정**
- 빈 대시보드에서 "명세서 올리기"가 보인다
- 다이얼로그 안에 **CSV 받는 법 안내**가 있다 ("신한카드: 마이페이지 결제내역에서 CSV 저장" 등)
- 카드 선택에 **"카드 1"이 이미 채워져 있다** — 사용자가 의식하지 않고 지나갈 수 있어야 한다

그 뒤 실제로 올린다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "base-2026-06.csv", "카드 1", 15000)).slice(0, 500));
EOF
```

**화면 판정** 진행률 카드 → 완료 요약. 요약은 **네 숫자 규칙**을 따른다:
"새로 추가된 거래 12건" (0이어도 반드시 표시) · 중복 0건은 표시하지 않음.

⚠︎ 진행률 카드에 파일명 대신 **job UUID** 가 뜬다(`KNOWN_ISSUES` ⓔ). 그 자리에
`7695a099-…` 같은 문자열이 보이는 것은 알려진 결함이지 이 시나리오의 실패가 아니다.

완료되면 **그 자리에서 집계가 갱신된다** — 빈 상태 문구가 사라지고 카테고리·차트가 채워진다.
폴링이 터미널 상태를 만나는 순간 `router.refresh()` 가 한 번 돌기 때문이다(`fix(progress)`).
빈 상태가 그대로 남아 있으면 그 새로고침이 죽은 것이다.

**DB 판정** 🔍 원본 파일이 **Next 서버를 통과하지 않고** Storage 에 직접 올라갔는지,
Storage 키의 파일명을 **서버가 생성**했는지 본다. 컬럼명은 `storage_key` 다.

```bash
psql -x -c "select status, original_filename, storage_key, card_label,
                   inserted_count, duplicate_count, skipped_rows
            from upload_jobs order by created_at desc limit 1;"
```

`storage_key` 가 클라이언트가 준 `base-2026-06.csv` 그대로면 **결함이다** — 서버가
생성한 이름이어야 하고, 원래 이름은 `original_filename` 컬럼에만 있어야 한다.
2026-08-27 실측값은 아래처럼 `{user_id}/{job_id}/{서버가 만든 uuid}.csv` 였다.

```
status            | completed
original_filename | base-2026-06.csv
storage_key       | c6e42962-…/7695a099-…/cac2f45f-….csv
inserted_count    | 12
```

---

## S3 — 다음 달 업로드 ✅ ⚠︎

**전제** U3 — 기본 시리즈 04~06 이 올라가 있다

**월 칩은 업로드가 끝나면 그 자리에서 갱신된다.** 예전에는 재방문해야 새 달이 보였는데
(`fix(progress)` 이전) 지금은 완료 시점에 서버 데이터를 다시 가져온다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "base-2026-07.csv", "카드 1", 9000)).slice(0, 200).replace(/\n+/g, " | "));
EOF
```

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard", 3000);
console.log("월 칩:", await page.evaluate(() =>
  [...document.querySelectorAll(".app-header__month-chip")].map((e) => e.innerText.trim()).join(" ")));
EOF
```

**화면 판정** 대시보드의 월 선택 칩에 새 달(2026-07)이 생기고 거기로 이동해 있다.

2026-08-27 실측(수정 전후) — 결함 ⓙ 일 때는 업로드 직후 `2026-06 2026-05 2026-04` 였고
재방문해야 `2026-07 …` 이 나왔다. 고친 뒤에는 업로드 직후 06월 막대가 그 자리에서
`33만원 → 35만원` 으로 바뀌는 것까지 확인했다(`add-one-2026-06.csv`, +19,000원).

**갱신이 안 되면 그것이 회귀다.** `UploadProgressCard` 의 폴링이 터미널 상태에서
`router.refresh()` 를 부르는지 본다.

**⚠︎ 결함 ⓐ** 칩은 `months.slice(0, 4)` 로 **4개만** 그린다. 기본 시리즈 4개월을
전부 올렸다면 가장 오래된 달이 칩에서 사라진다. 이건 알려진 결함이다.
위 실측이 정확히 상한선(4개)이라 여기서 한 달만 더 올리면 2026-04 가 사라진다.

**DB 판정**

```bash
psql -c "select date_trunc('month', transacted_on)::date as m, count(*), sum(amount)
         from transactions group by 1 order by 1;"
```

---

## S4 — 분류 수정 ✅ 🔍

**핵심은 한 건이 아니라 같은 가맹점 전부가 바뀌는가다.**

카테고리 `<select>` 는 React 가 제어하므로 값을 그냥 넣으면 무시된다. native setter 로
넣고 `change` 를 직접 쏜다(`prelude.js` 의 `setCard` 와 같은 방식). `option` 의 `value` 는
표시 이름 그대로다(`"식비"`, `"카페/간식"` …).

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard/transactions", 3000);
const r = await page.evaluate(() => {
  const row = [...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes("스타벅스"));
  const sel = row.querySelector("select");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, "식비");
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return sel.value;
});
console.log("변경:", r);
await page.waitForTimeout(4000);
EOF
```

**🚨 `transactions.category` 를 보고 판정하지 마라.** 수정은 원본 행을 고치지 않는다 —
`user_category_overrides` 에 쌓고 **조회할 때 겹친다.** 그래서 아래 SQL 은 고친 뒤에도
`카페/간식 5건` 을 그대로 돌려준다. 이걸 실패로 읽으면 안 된다.

```bash
psql -c "select merchant_normalized, category, count(*)
         from transactions where merchant_normalized like '%스타벅스%' group by 1,2;"
# → 스타벅스 | 카페/간식 | 5   (정상. 원본은 그대로다)
```

**통과 기준 세 가지를 모두 만족해야 한다.**

1. 같은 가맹점의 **다른 거래도 함께** 바뀐다 — **다른 달 화면**으로 본다

```bash
run <<'EOF'
const page = await auth();
for (const m of ["2026-06", "2026-04"]) {
  await go(page, `/dashboard/transactions?month=${m}`, 2500);
  console.log(m, await page.evaluate(() =>
    [...document.querySelectorAll("tbody tr")]
      .filter((r) => r.innerText.includes("스타벅스"))
      .map((r) => r.querySelector("select").value).join(",")));
}
EOF
```

2026-08-27 실측: `2026-06 식비,식비` · `2026-04 식비`. 대시보드 집계도 함께 옮겨간다
(06월 식비 19,000원 1건 → 36,100원 3건, 카페/간식 48,400원 6건 → 31,300원 4건).

2. `user_category_overrides` 에만 기록된다

```bash
psql -c "select * from user_category_overrides;"
# → user_id | 스타벅스 | 식비
```

3. **전역 캐시 `merchant_categories` 가 덮어써지지 않는다** — 한 사람의 취향이 전체에 퍼지면 안 된다

```bash
psql -c "select merchant_normalized, category from merchant_categories
         where merchant_normalized like '%스타벅스%';"
# → 0 rows (시드 룰로 분류된 가맹점은 애초에 캐시에 없다)
```

---

## S5 — 리포트 생성 ✅ 🔍

**전제** U3 또는 U5. 해당 달에 거래가 있어야 한다.

생성 요청과 결과 확인을 **두 스크립트로 나눈다** — 한 스크립트에서 20초를 기다리면
30초 제한에 걸린다.

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard/report/2026-06", 2500);
await page.click("text=리포트 만들기").catch((e) => console.log("이미 있음:", String(e).slice(0, 120)));
await page.waitForTimeout(8000);
EOF
```

```bash
run <<'EOF'
const page = await auth();
const t = await textOf(page, "/dashboard/report/2026-06", 3000);
console.log(t.slice(t.indexOf("지출 요약")).slice(0, 1200));
EOF
```

**화면 판정** "아직 생성되지 않음 / 리포트 만들기" → "N월 N일에 생성됨 / 다시 만들기".
상단 통계와 문단의 숫자가 **같아야 한다**.

**DB 판정** 🔍 **이게 이 시나리오의 본체다.** 문단의 모든 수치는 SQL 집계여야 한다.

```bash
psql -c "select total_expense, previous_total_expense, transaction_count, generated_at
         from monthly_reports where month = '2026-06-01';"
psql -c "select sum(amount) filter (where transaction_type = 'expense'), count(*)
         from transactions
         where transacted_on >= '2026-06-01' and transacted_on < '2026-07-01'
           and transaction_type = 'expense';"
```

**스냅샷과 실시간 집계가 일치해야 한다.** 어긋나면 화면에 "리포트를 만든 뒤 이 달
거래가 바뀌었습니다" 배지가 떠야 하고, 배지 없이 숫자만 다르면 결함이다.

문단 안의 숫자를 눈으로 읽어 위 SQL 결과와 대조한다. **LLM 이 만들어낸 숫자가 하나라도
있으면 실패다.**

**퍼센트가 나오면 페이로드까지 파고든다.** 문단의 비율은 LLM 이 나눗셈해서 만든 것이
아니라 신호 `payload` 의 비율을 `asWholePercent` 가 정수로 바꿔 넘긴 값이어야 한다.
컬럼명은 `type` · `impact` 다(`signal_type` · `impact_krw` 가 아니다).

```bash
psql -x -c "select type, target_key, impact, payload from spending_signals
            where period = '2026-06-01' order by impact desc limit 3;"
```

2026-08-27 실측 — 문단의 "생활/마트 항목 220,100원 중 99%"는 아래 페이로드에서 왔다.
`0.9859154929577465 → 99`. 문단에 이 원시 실수가 그대로 박혀 있으면 결함 ⓗ 의 재발이다.

```
type    | outlier_transaction
impact  | 217000
payload | {"amount": 217000, "categoryTotal": 220100, "transactedOn": "2026-06-22",
           "shareOfCategory": 0.9859154929577465, "merchantNormalized": "코스트코"}
```

같은 실측에서 스냅샷(`total_expense` 326850 · `transaction_count` 12)과 실시간 집계가
정확히 일치했고, 문단의 총지출·전월·카테고리별·가맹점 금액이 전부 SQL 값과 같았다.

---

## S6 — 처리 중 이탈 후 재방문 ✅

**🚨 이탈 타이밍으로 재현하려 들지 마라.** 이 시나리오는 "처리 중"이라는 상태를 봐야 하는데
로컬 처리가 너무 빨라 그 창이 거의 없다. 2026-08-27 실측:

- `base-2026-05.csv` 재업로드 → **4.5초 만에 completed**(전부 중복 10건, fingerprint
  캐시 히트라 LLM 호출이 아예 없다). 돌아왔을 때는 이미 끝나 카드가 없다
- 처음 보는 가맹점이 든 `unknown-merchants.csv` → 13초. 그래도 이탈·복귀 왕복(약 4.5초)
  안에 상태가 어디까지 갔는지 매번 달라 **판정이 흔들린다**

그래서 **상태를 직접 만들어** 본다. 이게 재현 가능한 유일한 방법이다.

```bash
psql -c "update upload_jobs set status='categorizing'
         where original_filename='unknown-merchants.csv';"
```

```bash
run <<'EOF'
const page = await auth();
const t = await dash(page, 2500);
const i = t.indexOf("명세서 처리");
console.log(i >= 0 ? t.slice(i, i + 180).replace(/\n+/g, " | ") : "진행률 카드 없음");
EOF
```

```bash
psql -c "update upload_jobs set status='completed' where status='categorizing';"
```

**끝나면 반드시 되돌려라.** `categorizing` 으로 남겨 두면 진행률 카드가 영영 폴링해
이후 모든 시나리오에서 `networkidle` 이 오지 않는다(결함 ⓒ와 같은 상태가 된다).

**화면 판정** 대시보드에 진행률 카드가 그대로 있고 "카테고리를 분류하는 중"과 진행률(75%)이
보인다. 브라우저를 떠나 있어도 워커는 계속 돈다. 2026-08-27 실측 출력:

```
명세서 처리 | 카테고리를 분류하는 중 | bec9a815-… | 카테고리를 분류하는 중 | 75%
```

**⚠︎ 결함 ⓔ** 카드 제목이 파일명이 아니라 job UUID 다 — 위 출력에서도 그렇다.

---

## S7 — 결제 ✅ 🔍

**끝까지 갈 수 있다.** Polar sandbox 는 실제 결제를 처리하지 않으므로(`livemode: false`)
체크아웃부터 웹훅 반영까지 전 구간을 실제로 돌린다. 준비는 `docs/POLAR_SETUP.md` 를 따른다.

**전제** U4 + `.env.local` 에 `POLAR_*` 5개 + ngrok 터널 + Polar 에 그 URL 로 등록한 웹훅

```bash
scripts/browser-test/actor.sh u4
```

**화면 판정 ✅ (2026-08-27 실측)** `actor.sh u4` 는 `trial_started_at` 을 밀어 만료를 만든다.
화면에 **읽기 전용 배너**("체험 또는 결제 기간이 끝나 새 업로드와 수정은 잠겨 있습니다")와
월간 4,900원 · 연간 49,000원 카드, "연간 결제는 월간 결제 12개월보다 9,800원 저렴합니다"가
나온다. 헤더 버튼도 "명세서 올리기"가 아니라 **"결제하고 계속 쓰기"** 다.

```bash
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/dashboard/billing", 2500)).slice(0, 450).replace(/\n+/g, " | "));
EOF
```

**결제 판정 ✅ (2026-08-30 실측)** 체크아웃을 만들고 결제까지 간다.

```bash
COOKIE=$(cat /tmp/finsight-cookie.txt)   # up.sh 가 만든 쿠키를 "name=value" 로 합친 것
curl -s -X POST http://localhost:3000/api/billing/checkout \
  -H "content-type: application/json" -H "Cookie: $COOKIE" \
  -d '{"plan":"monthly"}'
# -> {"checkoutUrl":"https://sandbox.polar.sh/checkout/polar_c_..."}
```

그 URL 을 브라우저로 연다. **KRW 상품이라 한국 결제수단(Kakao Pay·Naver Pay·Local card)이
먼저 뜬다.** 아무거나 고르면 Stripe 의 **테스트 결제 시뮬레이터**로 넘어가는데, 카드 정보를
넣는 화면이 아니라 `AUTHORIZE TEST PAYMENT` / `FAIL TEST PAYMENT` 버튼만 있는 페이지다.
승인을 누르면 결제가 끝나고 `success_url` 로 돌아온다.

> **실제 카드번호를 넣지 마라.** 넣을 자리도 없고, test mode 라 어차피 거부된다.
> 실패 경로를 보고 싶으면 `FAIL TEST PAYMENT` 를 쓴다.

**DB 판정 ✅** 웹훅 3건이 순서대로 들어오고 `profiles` 가 바뀐다.

```bash
docker exec supabase_db_part2_project_finsight psql -U postgres -d postgres -c "
  select subscription_status, current_period_end, polar_customer_id from public.profiles;
  select event_type, received_at from public.processed_webhook_events order by received_at desc limit 5;"
```

2026-08-30 실측: `subscription.created` → `active` → `updated` 세 건이 1초 간격으로 들어오고
`profiles` 가 `active` · `current_period_end` 는 한 달 뒤 · `polar_customer_id` 가 채워졌다.
Polar 대시보드의 Deliveries 에도 셋 다 **200** 으로 남는다.

**멱등 판정 ✅** Polar 대시보드에서 배달 하나를 펼쳐 `Redeliver` 를 누른다. 같은
`webhook-id` 로 다시 오므로 **`processed_webhook_events` 행 수가 늘지 않아야 한다**
(응답은 200 `duplicate`). 실측에서 요청 4건 · 행 3건이었다.

**서명 판정 ✅** 서명이 없거나 틀린 요청은 **401** 이다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/polar \
  -H "content-type: application/json" -d '{}'   # -> 401
```

**곁가지 판정 ✅** 구독이 살아 있는 동안 다시 결제를 시도하면 **409**, 고객 포털은
`polar_customer_id` 가 생긴 뒤에야 **200** 이다(그 전에는 409 + `redirectTo`).

```bash
curl -s -X POST http://localhost:3000/api/billing/portal -H "Cookie: $COOKIE"
curl -s -X POST http://localhost:3000/api/billing/checkout \
  -H "content-type: application/json" -H "Cookie: $COOKIE" -d '{"plan":"monthly"}'   # -> 409
```

**웹훅을 손으로 만들어 쏘는 방법**(터널 없이 서명 로직만 볼 때) 🔍 서명 대상은
`"{webhook-id}.{timestamp}.{raw body}"` 이고 HMAC 키는 `POLAR_WEBHOOK_SECRET` 의
**UTF-8 바이트 그대로**다.

> 페이로드 스키마가 빡빡해 필드가 하나라도 빠지면 **401 이 아니라 200 `ignored`** 로
> 조용히 무시된다. `WebhookSubscriptionActivePayload$inboundSchema.parse()` 로 먼저
> 맞춰 본 뒤 보낸다.

**끝나고 되돌린다.** 결제 상태가 남아 있으면 다른 시나리오가 오염된다.

```bash
scripts/browser-test/actor.sh u4
```

---

## S8 — 해지 ✅

**전제** U5 → U6

```bash
scripts/browser-test/actor.sh u6
```

```bash
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/settings", 2500)).slice(0, 600));
EOF
```

**화면 판정** "○월 ○일까지 이용할 수 있습니다" 형태로 **남은 기간**이 보인다.
`canceled` 라고 해서 즉시 차단되면 결함이다 — 기간 내에는 `active` 와 같은 권한이다.

2026-08-27 실측(`canceled` · `current_period_end = 2026-09-06`):

```
구독 상태 | 해지 예정 | 9월 6일까지 이용할 수 있습니다.
```

**권한이 살아 있는지는 헤더 버튼으로 본다.** 여기서 "명세서 올리기"가 그대로 보이면 통과다
(잠겼다면 S7 처럼 "결제하고 계속 쓰기"로 바뀐다). 상태 문자열만 보고 판정하지 마라.

> `actor.sh` 는 `profiles` 의 상태 컬럼만 바꾸므로 결제 이력이 없다. 그래서 "아직 결제한
> 적이 없어 관리할 구독이 없습니다"가 함께 뜨는 것은 픽스처의 한계지 결함이 아니다.

**DB 판정** 업로드 버튼이 여전히 있는지 확인한다(권한 매트릭스: `canceled` 기간 내 = 쓰기 허용).

```bash
run <<'EOF'
const page = await auth();
console.log((await dash(page)).includes("명세서 올리기") ? "쓰기 허용 ✓" : "차단됨 ✗");
EOF
```

---

# 2. 업로드 분기·예외 (S9~S17)

이 절은 `upload_jobs.status` 가 어디로 가는지가 판정의 핵심이다. 매번 이 SQL 로 확인한다.

```bash
psql -x -c "select id, status, failed_reason, mapping_attempt_count, original_filename
            from upload_jobs order by created_at desc limit 1;"
```

**세 갈래를 헷갈리지 않는다** (USER_FLOW § 상태 머신 1).

| 무엇이 잘못됐나 | 가는 곳 | 이유 |
|---|---|---|
| 행이 **안 읽힌다** (샘플 성공률 90% 미만, 전체 실패율 20% 초과) | `needs_mapping` | 컬럼을 다시 고르면 되는 경우가 대부분이다 |
| 행은 읽혔는데 **값이 말이 안 된다** (sanity 3종) | `failed` | 컬럼을 바꿔도 소용없다 |
| 데이터 행이 **0건** | `failed` "거래가 없는 파일입니다." | 읽지 못한 게 아니라 읽을 것이 없었다 |

## S9 — 자동 컬럼 매핑 실패 ✅

**전제** 형식 캐시를 지워야 자동 추론을 다시 본다.

```bash
scripts/browser-test/reset.sh cache
```

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "opaque-headers.csv", "카드 1", 12000)).slice(0, 400));
EOF
```

**화면 판정** "어떤 컬럼이 날짜·금액·가맹점인지 알려주세요" + "컬럼 직접 고르기".
매핑 화면에는 **CSV 앞 10행 미리보기**와 드롭다운 3개가 있다.

```bash
run <<'EOF'
const page = await auth();
const id = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => x.href.includes("/mapping"));
  return a ? a.href : null;
});
console.log("매핑 URL:", id);
if (id) { await page.goto(id, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500);
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 700)); }
EOF
```

**DB 판정** `status = 'needs_mapping'`, `mapping_attempt_count = 0`.

---

## S10 — 수동 매핑도 검증 실패 ◻︎

S9 에 이어서 **일부러 틀린 컬럼**을 고른다. 두 가지를 봐야 한다.

**(a) 날짜를 틀리게 고른 경우** — 다시 물어야 한다.

**(b) 날짜는 맞고 금액만 틀리게 고른 경우** — 이것도 다시 물어야 한다.
이게 최근에 고친 결함이다. 예전에는 `failed` 로 끝나 남은 시도 횟수를 못 썼다.

```bash
run <<'EOF'
const page = await auth();
const link = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => x.href.includes("/mapping"));
  return a ? a.href : null;
});
await page.goto(link, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
// 드롭다운 3개의 선택지를 먼저 본다
console.log(await page.evaluate(() =>
  [...document.querySelectorAll("select")].map((s) =>
    `${s.name || s.id}: ${[...s.options].map((o) => o.value).join("/")}`).join("\n")));
EOF
```

드롭다운에는 `id` 도 `name` 도 없다. **순서로 잡는다** — `[날짜, 금액, 가맹점, 유형]`.
React 제어 컴포넌트라 native setter + `change` 가 필요하다(S4 와 같은 방식).

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard", 2000);
const link = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => x.href.includes("/mapping"));
  return a ? a.href : null;
});
await page.goto(link, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  const sels = [...document.querySelectorAll("select")];
  [["f2", 0], ["f3", 1], ["f2", 2]].forEach(([v, i]) => {   // 날짜를 일부러 틀리게
    setter.call(sels[i], v);
    sels[i].dispatchEvent(new Event("change", { bubbles: true }));
  });
});
await page.waitForTimeout(400);
await page.click("text=매핑 확정");
await page.waitForTimeout(6000);
EOF
```

**화면 판정**
- 시도 후 **(a) 2026-08-27 실측 통과**: 매핑 화면에 "시도 1회 · 남은 시도 2회"와
  "선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요". DB 는
  `needs_mapping` 유지 · `mapping_attempt_count = 1`
- **(b) 금액만 틀렸을 때는 아직 검증하지 못했다.** `opaque-headers.csv` 에는 **날짜로 읽히는
  컬럼이 아예 없어**(`X0091` · `ZZ-ALPHA` · `1200` · `Q`) "날짜는 맞고 금액만 틀린" 조합을
  만들 수 없다. 검증하려면 **헤더는 불투명하지만 날짜 컬럼은 유효한 픽스처**가 있어야 한다.
  판정 기준은 그대로다 — 원인과 무관하게 "날짜를 읽지 못했습니다" 가 뜨면 예전 결함으로
  되돌아간 것이다
- 상한 도달 시 **2026-08-27 실측 통과**: 3회를 쓰면 `failed` 로 끝나고 대시보드 카드가
  "업로드를 처리하지 못했습니다 / 이 파일은 읽을 수 없습니다. / **다시 시도**" 가 된다
  (매핑 화면의 "업로드 취소"는 상한 전에 있는 버튼이다)

**DB 판정** 🔍 시도마다 `mapping_attempt_count` 가 오르고, 상한 전에는 `needs_mapping` 을 유지한다.

```bash
psql -x -c "select status, mapping_attempt_count, failed_reason
            from upload_jobs order by created_at desc limit 1;"
```

2026-08-27 실측 — 1회: `needs_mapping` / 1 / "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요.",
3회: `failed` / 3 / "이 파일은 읽을 수 없습니다."

> **이 시나리오는 (b) 를 못 돌려 `◻︎` 로 남긴다.** (a) 와 상한은 통과했다.

---

## S11 — 매핑 포기 ✅ 🔍

매핑 화면에서 업로드 취소를 누른다. `needs_mapping` job 이 없으면
`reset.sh cache` 후 `opaque-headers.csv` 를 올려 하나 만든다.

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard", 2000);
const link = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => x.href.includes("/mapping"));
  return a ? a.href : null;
});
await page.goto(link, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.click("text=업로드 취소");
await page.waitForTimeout(5000);
console.log("URL:", page.url());
EOF
```

**화면 판정** `/dashboard/uploads` 로 이동하고 그 job 이 이력에서 사라진다.

**DB 판정** 🔍 job row 와 **Storage 파일이 둘 다** 지워져야 한다. row 만 지우고
파일이 남으면 원본 CSV 가 영구히 남는다 — 계정 삭제(S27)가 유일한 삭제 경로라는
전제가 깨진다.

**버킷 이름은 `transaction-csv-uploads` 다**(`uploads` 가 아니다). 로컬에서는 CLI 말고
`storage.objects` 를 직접 보는 쪽이 빠르다.

```bash
psql -c "select count(*) from upload_jobs where status = 'needs_mapping';"
psql -c "select count(*) from storage.objects where bucket_id='transaction-csv-uploads';"
psql -c "select count(*) from storage.objects where name like '%<job-id>%';"
```

2026-08-27 실측 — 취소 전 오브젝트 26개 → 취소 후 **25개**, 그 job 의 키는 **0건**,
`upload_jobs` 의 해당 row 도 0건. 파일과 row 가 함께 사라졌다.

---

## S12 — 일부 행 파싱 실패 (20% 이하) ✅

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "partial-broken.csv", "카드 1", 15000)).slice(0, 400));
EOF
```

픽스처는 12행 중 2행이 깨져 있다(16.7% — 20% 이하).

**화면 판정** job 은 계속 진행되어 `completed` 로 끝나고, 요약에 **"읽지 못한 행 2건"** 이 뜬다.

**DB 판정**

```bash
psql -c "select status, inserted_count, skipped_rows from upload_jobs
         order by created_at desc limit 1;"
```

`status = 'completed'`, `skipped_rows = 2`, `inserted_count = 10`.

---

## S12b — 행 파싱 실패율 20% 초과 ◻︎

**두 픽스처가 서로 다른 곳으로 간다. 이 차이가 명세다.**

**(a) 날짜를 못 읽는 행이 75%** → `needs_mapping`

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "mostly-broken-dates.csv", "카드 1", 12000)).slice(0, 400));
EOF
```

화면: "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요" + S9 와 같은 컬럼 선택 화면.

**(b) 금액을 못 읽는 행이 75%** → `failed`

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "mostly-broken-amounts.csv", "카드 1", 12000)).slice(0, 400));
EOF
```

화면: "금액이 0원이거나 읽을 수 없는 행이 너무 많습니다."

> **(b) 를 결함으로 착각하기 쉽다.** `USER_FLOW` 70행이 "금액을 읽을 수 없으면 failed"
> 라고 명시하고 `src/lib/csv/mapping.test.ts:56` 이 그 의도를 고정한다. 자동 매핑
> 경로에서 금액 실패는 `needs_mapping` 이 아니다.

---

## S12c — 값이 이상 (sanity 3종) ◻︎

**셋 다 `failed` 이고, 컬럼 선택 화면을 띄우지 않는다.**

```bash
run <<'EOF'
const page = await auth();
for (const f of ["future-dates.csv", "too-old.csv", "zero-amounts.csv", "header-only.csv"]) {
  const t = await upload(page, f, "카드 1", 10000);
  console.log("###", f, "→", t.split("\n").filter((l) => l.includes("습니다"))[0]);
}
EOF
```

| 픽스처 | 기대 사유 |
|---|---|
| `future-dates.csv` | "거래일이 미래이거나 10년 이전인 행이 너무 많습니다." |
| `too-old.csv` | 같은 사유 |
| `zero-amounts.csv` | "금액이 0원이거나 읽을 수 없는 행이 너무 많습니다." |
| `header-only.csv` | "거래가 없는 파일입니다." |

**DB 판정** 🔍 **fingerprint 를 저장하지 않아야 한다.** 저장하면 잘못된 컬럼 매핑이
개인 캐시에 굳어 같은 형식의 다음 파일이 전부 같은 곳으로 간다.

```bash
psql -c "select header_hash, created_at from csv_format_fingerprints order by created_at desc limit 3;"
```

**⚠︎ 결함 ⓕ** 실패한 job 의 요약 칸이 "완료 후 표시됩니다" 로 남는다.

---

## S12d — 환불·입금 행 ◻︎ 🔍

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "refund-deposit.csv", "카드 1", 15000)).slice(0, 400));
EOF
```

**DB 판정** 🔍 **이 시나리오의 본체다.**

```bash
psql -c "select transaction_type, count(*), sum(amount) from transactions
         where transacted_on >= '2026-03-01' and transacted_on < '2026-04-01'
         group by 1;"
```

- `취소`·`할부취소` 행 → `refund`
- `입금` 행 → `deposit`
- 나머지 → `expense`

**화면 판정** 거래 목록에 환불이 **별도로** 표시되고, 지출 합계에서 **빼지 않는다**.
"3월 지출 30만원 / 환불 15만원" 처럼 나란히 보여야 한다. 환불이 지출에서 차감돼
합계가 줄면 결함이다.

> 자동이체·할부·분할납부도 **지출 수단**이다. 통신요금·보험료·구독료가 자동이체로
> 빠지는데 이것들이 버려지면 반복 지출 탐지가 딛고 설 데이터가 사라진다.
> 그리고 20% 임계 미만이면 job 은 `completed` 로 끝나 티도 안 난다.

---

## S13 — 일부 배치 분류 실패 ◻︎

전역 캐시에 없고 뜻을 알 수 없는 가맹점만 담은 픽스처를 쓴다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "unknown-merchants.csv", "카드 1", 20000)).slice(0, 400));
EOF
```

**화면 판정** job 은 **성공**으로 끝나고, 요약에 "분류하지 못해 "기타"로 넣은 가맹점 N개"
가 붙는다. 분류 실패로 job 을 죽이면 안 된다.

**DB 판정**

```bash
psql -c "select category, category_fallback, count(*) from transactions
         where transacted_on >= '2025-12-01' and transacted_on < '2026-01-01'
         group by 1,2;"
```

> LLM 이 실제로 분류에 성공할 수도 있다. **분류 실패를 확실히 만들려면** `.env.local` 에
> 잘못된 `OPENAI_API_KEY` 를 넣고 돌린다. 그때도 job 은 `completed` 여야 하고 전부 `기타` 다.

---

## S14 — job 완전 실패 ◻︎

S12c 의 어느 픽스처든 쓴다.

**화면 판정** 사유가 **사람 말**로 뜨고 "다시 시도" 버튼이 있다. 스택 트레이스나
영문 에러가 보이면 결함이다.

**새로고침해도 카드가 남아야 한다.** 예전에는 조회에서 `failed` 가 빠져 있어
새로고침하는 순간 사유가 사라졌다. 지금은 **최근 24시간**짜리 실패만 카드로 남는다.

```bash
run <<'EOF'
const page = await auth();
console.log("--- 첫 진입 ---");
console.log((await dash(page)).slice(0, 200));
console.log("--- 새로고침 ---");
console.log((await dash(page)).slice(0, 200));
EOF
```

> 실패 카드 **개수** 상한은 없다. 짧은 시간에 여러 번 실패시키면 카드가 화면을 덮는다.
> `scripts/browser-test/reset.sh jobs` 로 비운다.

---

## S15 — 같은 파일 재업로드 ◻︎

이미 올린 파일을 **그대로 다시** 올린다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "base-2026-06.csv", "카드 1", 15000)).slice(0, 400));
EOF
```

**화면 판정** "새로 추가된 거래 0건" 이 **반드시 보여야 한다**. 0이라고 숨기면
사용자가 가장 혼란스러워하는 경우가 된다. 함께 "중복이라 건너뛴 거래 12건".

**DB 판정** 거래 수가 늘지 않는다.

```bash
psql -c "select count(*) from transactions
         where transacted_on >= '2026-06-01' and transacted_on < '2026-07-01';"
```

---

## S16 — xlsx·PDF·빈 파일 ◻︎

**업로드 전에 클라이언트에서 거부해야 한다.** 서버까지 가면 실패다.

```bash
run <<'EOF'
const page = await auth();
console.log("--- fake.xlsx ---");
console.log((await attachOnly(page, "fake.xlsx", "카드 1",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).slice(0, 300));
EOF
```

```bash
run <<'EOF'
const page = await auth();
console.log("--- empty.csv ---");
console.log((await attachOnly(page, "empty.csv", "카드 1")).slice(0, 300));
EOF
```

**화면 판정** "CSV 파일만 올릴 수 있습니다. 카드사에서 '엑셀 저장' 대신 'CSV 저장'을
선택하세요" — 원인만이 아니라 **어떻게 하면 되는지**까지 말해야 한다.

**DB 판정** `upload_jobs` 에 row 가 **생기지 않아야 한다**.

---

## S17 — EUC-KR/CP949 인코딩 ◻︎

**사용자에게 아무것도 노출하지 않는 것이 통과 조건이다.**

```bash
run <<'EOF'
const page = await auth();
await openDialog(page, "카드 1");
await attachBase64(page, "euckr.csv", await readFile("euckr.csv.b64"));
await submit(page, 15000);
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400));
EOF
```

**화면 판정** 인코딩에 대한 안내·경고가 **없다**. 정상 업로드와 구분되지 않는다.

**DB 판정** 🔍 가맹점명이 깨지지 않았는지 본다. 이건 화면 숫자만으로는 모른다.

```bash
psql -c "select merchant_raw, merchant_normalized, amount from transactions
         where transacted_on >= '2026-02-01' and transacted_on < '2026-03-01'
         order by transacted_on limit 10;"
```

`스타벅스`·`이마트` 처럼 읽혀야 한다. `��Ÿ����` 같은 값이 하나라도 있으면 실패다.

---

# 3. 다중 카드·업로드 이력 (S24 · S24b · S25 · S34)

## S24 — 같은 달에 여러 카드 명세서 ◻︎ 🔍

**핵심은 `card_label` 이 `dedupe_key` 에 들어가는가다.** 같은 날·같은 금액·같은
가맹점이라도 카드가 다르면 둘 다 남아야 한다.

`card-b-2026-06.csv` 는 기본 시리즈와 **`2026-06-03 스타벅스 강남점 8900`** 한 줄이
겹치도록 만들었다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "card-b-2026-06.csv", "카드 2", 15000)).slice(0, 400));
EOF
```

**DB 판정** 🔍 겹치는 한 줄이 **두 건 다** 있어야 한다.

```bash
psql -c "select card_label, count(*) from transactions t
         join upload_jobs j on j.id = t.upload_job_id
         where transacted_on >= '2026-06-01' and transacted_on < '2026-07-01'
         group by 1;"
psql -c "select dedupe_key from transactions
         where transacted_on = '2026-06-03' and amount = 8900;"
```

한 건만 남았다면 `card_label` 이 `dedupe_key` 에서 빠진 것이다.

**화면 판정** 업로드 이력에 파일별로 카드가 함께 표시된다.

```bash
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/dashboard/uploads", 2500)).slice(0, 700));
EOF
```

---

## S24b — 두 번째 카드를 첫 카드 이름 그대로 ⚠︎ ◻︎

**전제** "카드 1" 로 신한 형식(`base-*`)을 이미 올려 두었다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "card-b-2026-06.csv", "카드 1", 15000)).slice(0, 500));
EOF
```

`card-b-2026-06.csv` 는 헤더가 다르므로(`거래일시,가맹점명,승인금액,…`) `header_hash` 가
어긋나고, 그것이 경고의 근거다.

**화면 판정** 거래는 **저장하되** 완료 요약에 경고가 함께 뜬다:
"이 파일은 '카드 1'로 올린 이전 파일과 형식이 다릅니다. 다른 카드라면 삭제 후
카드를 바꿔 올려주세요"

**⚠︎ 결함 ⓖ** 이 경고가 한 번 켜지면 이후 업로드에도 따라붙는 것으로 보인다.
**원인 미확정이다.** 반복해서 뜨면 새 결함으로 보고하기 전에 재현 조건부터 좁힌다.

**DB 판정**

```bash
psql -c "select original_filename, card_label, card_label_mismatch_warning
         from upload_jobs order by created_at desc limit 3;"
```

---

## S25 — 업로드 여러 건 동시 진행 ◻︎

```bash
run <<'EOF'
const page = await auth();
await openDialog(page, "카드 1");
await attach(page, "base-2026-04.csv", await readFile("base-2026-04.csv"));
await submit(page, 800);
await openDialog(page, "카드 1");
await attach(page, "base-2026-05.csv", await readFile("base-2026-05.csv"));
await submit(page, 2000);
console.log((await dash(page, 1500)).slice(0, 500));
EOF
```

**화면 판정** 진행률 카드가 **여러 장 쌓인다**. 하나가 다른 하나를 덮어쓰지 않는다.

**DB 판정** job 이 서로 독립적으로 끝난다.

```bash
psql -c "select id, status, original_filename from upload_jobs
         order by created_at desc limit 2;"
```

---

## S34 — 날짜 형식이 모호한 CSV ⚠︎ ◻︎ 🔍

**이 시나리오는 "조용히 틀리는 것을 보이게 만드는가"를 본다.** 파싱은 어느 쪽으로
읽어도 성공하므로 화면에는 늘 그럴듯한 숫자가 뜬다.

**(a) 판별 가능한 파일** — `ambiguous-date.csv` 는 `03/04`, `03/11`, `03/18`, `03/25`, `03/28`
이라 두 번째 자리에 13 이상이 있어 `MM/DD/YYYY` 로 확정된다.

```bash
run <<'EOF'
const page = await auth();
await upload(page, "ambiguous-date.csv", "카드 1", 15000);
console.log((await textOf(page, "/dashboard/uploads", 2500)).slice(0, 700));
EOF
```

**(b) 끝까지 구분되지 않는 파일** — `unresolvable-date.csv` 는 모든 값이 12 이하다.
`YYYY-MM-DD` 계열로 가정하고, **가정했다는 사실을 이력에 적어야 한다**.

```bash
run <<'EOF'
const page = await auth();
await upload(page, "unresolvable-date.csv", "카드 1", 15000);
console.log((await textOf(page, "/dashboard/uploads", 2500)).slice(0, 700));
EOF
```

**화면 판정** 업로드 이력에 해석한 날짜 형식이 보인다 ("03/04/2026 → 3월 4일로 읽음").
틀렸을 때의 복구 경로는 **그 업로드를 삭제하고 다시 올리는 것**이다 — 완료된 job 의
매핑을 고치는 UI 는 MVP 에 없다(ADR-001). "형식이 틀렸다면 이 업로드를 삭제하고
다시 올려주세요" 안내가 함께 있어야 한다.

**⚠︎ 결함 ⓑ** `src/lib/csv/date.ts:159` 가 명백한 ISO 에도 `assumed-iso` 를 붙여
**모든 업로드에** "구분되지 않아 이 형식으로 가정했습니다" 가 뜬다. (a) 에서 이 문구가
보였다고 판별이 실패한 것이 아니다. 판정은 **실제로 3월 4일로 저장됐는가**로 한다.

**DB 판정** 🔍

```bash
psql -c "select transacted_on, merchant_normalized from transactions
         where merchant_normalized like '%마포%' order by transacted_on;"
```

`2026-03-04`, `2026-03-11`, `2026-03-18`, `2026-03-25`, `2026-03-28` 이어야 한다.
`2026-04-03` 처럼 뒤집혀 있으면 실패다.

---

# 4. 구독·권한 (S18~S20 · S26 · S27)

이 절의 판정 기준은 하나다 — **`expired` 는 쓰기 전부를 막고 읽기 전부를 연다**
(ADR-005). 자기 금융 데이터를 인질로 잡으면 결제가 아니라 탈퇴를 부른다.

## S18 — 체험 만료 상태로 업로드 시도 ✅

```bash
scripts/browser-test/actor.sh u4
```

```bash
run <<'EOF'
const page = await auth();
const t = await dash(page);
console.log("업로드 버튼:", t.includes("명세서 올리기") ? "있음 ✗" : "없음 ✓");
console.log("결제 안내:", t.includes("결제하고 계속 쓰기") ? "있음 ✓" : "없음 ✗");
console.log(t.slice(0, 400));
EOF
```

**화면 판정** 업로드 버튼 자리가 "결제하고 계속 쓰기"로 바뀌고 읽기 전용 배너가 깔린다.
**기존 데이터는 그대로 보인다.**

**서버 판정** 🔍 **버튼을 숨기는 것은 게이트가 아니다.** API 를 직접 찔러 막히는지 본다.

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard", 1000);
const r = await page.evaluate(async () => {
  const res = await fetch("/api/uploads/signed-url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: "x.csv", cardLabel: "카드 1" }),
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
});
console.log(r);
EOF
```

**403(또는 그에 준하는 차단)이어야 한다.** 200 이 오면 클라이언트에서만 숨긴 것이다.

**읽기가 열려 있는지도 확인한다.** 아래 셋은 `expired` 에서도 열려야 한다.

```bash
run <<'EOF'
const page = await auth();
for (const p of ["/dashboard/subscriptions", "/dashboard/review/2026-06", "/dashboard/transactions"]) {
  const t = await textOf(page, p, 2000);
  console.log(p, "→", t.length > 200 ? "열림 ✓" : "막힘 ✗", "|", t.slice(0, 80).replace(/\n/g, " "));
}
EOF
```

거래 목록은 **화면이 아니라 동작을 잠근다** — 목록과 검색은 열리고 카테고리
드롭다운만 비활성이다.

---

## S19 — 체크아웃 중 이탈 ◻︎

`/dashboard/billing` 에서 체크아웃을 시작하고 돌아오지 않는다.

**화면 판정** 만료 상태가 그대로다. **DB 판정** `subscription_status` 가 바뀌지 않는다.

```bash
psql -c "select subscription_status, current_period_end from profiles;"
```

---

## S20 — 결제했는데 웹훅 지연 ◻︎

**전제** U4. 결제 복귀 페이지로 직접 들어간다(웹훅은 보내지 않는다).

**화면 판정** "결제를 확인하는 중" 으로 최대 30초 폴링하다가
"곧 반영됩니다. 새로고침해 주세요" 로 바뀐다. 무한 로딩이면 결함이다.

---

## S26 — 비로그인 상태로 딥링크 ◻︎

**무조건 `/dashboard` 로 보내면 실패다.** 원래 가려던 경로로 돌아와야 한다.

```bash
run <<'EOF'
const page = await browser.getPage("anon2");
await page.context().clearCookies();
await page.goto("http://localhost:3000/dashboard/report/2026-06", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
console.log("URL:", page.url());
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 300));
EOF
```

**판정** 로그인으로 보내되 원래 경로를 어딘가에 지니고 있어야 한다(쿼리스트링·쿠키 등).
`/auth/callback` 이 그 값을 읽어 복귀시키는지 코드로 확인한다 — OAuth 왕복은 자동화할 수 없다.

```bash
grep -n "redirect\|next\|returnTo" src/app/auth/callback/route.ts
```

---

## S27 — 계정 삭제 ⛔ ◻︎ 🔍

**되돌릴 수 없다. 반드시 백업을 먼저 뜬다.**

```bash
docker exec supabase_db_part2_project_finsight pg_dump -U postgres -d postgres \
  --data-only --schema=public > /tmp/pre-s27-backup.sql
wc -c /tmp/pre-s27-backup.sql
```

**화면 판정** `/settings` 에서 되돌릴 수 없음을 **명시하고 재확인**을 받는다.
"거래 N건과 신호 N건이 함께 사라집니다." · "원본 CSV 파일도 삭제되며 되돌릴 수 없습니다."
확인 없이 한 번에 지워지면 결함이다.

**DB 판정** 🔍 **이 시나리오의 본체이자 가장 틀리기 쉬운 지점이다.**

```bash
psql -c "select
  (select count(*) from transactions) as txns,
  (select count(*) from upload_jobs) as jobs,
  (select count(*) from spending_signals) as signals,
  (select count(*) from monthly_reports) as reports,
  (select count(*) from user_category_overrides) as overrides,
  (select count(*) from csv_format_fingerprints) as fingerprints,
  (select count(*) from profiles) as profiles,
  (select count(*) from merchant_categories) as global_cache;"
```

- 개인 데이터는 **전부 0** 이어야 한다
- **`merchant_categories` 는 남아야 한다** — 전역 캐시는 사용자 데이터가 아니다.
  여기가 0이 되면 한 사람의 탈퇴가 전체 사용자의 분류 비용을 다시 물린다
- Storage 원본 파일도 지워져야 한다

복원:

```bash
docker exec -i supabase_db_part2_project_finsight psql -U postgres -d postgres \
  < /tmp/pre-s27-backup.sql
```

복원 뒤에는 `profiles` 가 만료 상태로 돌아올 수 있다. `scripts/browser-test/actor.sh u3` 로 되돌린다.

---

# 5. 대시보드·리포트 빈 상태 (S21~S23)

**"없는 것을 있는 척하지 않는가"가 이 절의 판정 기준이다.**

## S21 — 데이터가 한 달치뿐 ◻︎

```bash
scripts/browser-test/reset.sh data
```

```bash
run <<'EOF'
const page = await auth();
await upload(page, "single-month.csv", "카드 1", 20000);
console.log((await textOf(page, "/dashboard?month=2025-08", 3000)).slice(0, 600));
EOF
```

**화면 판정** 전월 대비 증감 자리가 **비어 있고** "비교할 지난달 데이터가 없습니다"
가 보인다. 0원이나 +0% 로 채우면 실패다 — 없는 것과 0은 다르다.

---

## S22 — 거래가 없는 달 선택 ◻︎

```bash
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/dashboard?month=2024-01", 2500)).slice(0, 400));
EOF
```

**화면 판정** "이 달에는 거래가 없습니다" + 업로드 버튼. 빈 차트나 0원 카드가 아니다.

**⚠︎ 결함 ⓐ** 월 선택 칩이 4개뿐이라 오래된 달은 위처럼 **URL 을 직접 쳐야** 열린다.

---

## S23 — 리포트 생성 후 그 달 거래 추가 ◻︎ 🔍

**전제** 2026-06 리포트를 이미 만들었다(S5).

```bash
run <<'EOF'
const page = await auth();
console.log("--- 추가 전 ---");
console.log((await textOf(page, "/dashboard/report/2026-06", 3000)).slice(0, 500));
EOF
```

```bash
run <<'EOF'
const page = await auth();
await upload(page, "add-one-2026-06.csv", "카드 1", 15000);
console.log("--- 추가 후 ---");
console.log((await textOf(page, "/dashboard/report/2026-06", 3000)).slice(0, 600));
EOF
```

**화면 판정 세 가지를 모두 만족해야 한다.**
1. 리포트가 **자동으로 다시 만들어지지 않는다**
2. 생성 시각("6월 12일에 생성됨")과 "다시 만들기"가 항상 보인다
3. 거래가 바뀌었으면 **"리포트를 만든 뒤 이 달 거래가 바뀌었습니다" 배지**가 뜬다

**DB 판정** 🔍 상단 통계가 **생성 시점 스냅샷**을 그대로 유지해야 한다. 실시간 집계로
슬쩍 갈아끼우면 문단과 숫자가 어긋난다.

```bash
psql -c "select total_expense, transaction_count, generated_at
         from monthly_reports where month = '2026-06-01';"
psql -c "select sum(amount), count(*) from transactions
         where transacted_on >= '2026-06-01' and transacted_on < '2026-07-01'
           and transaction_type = 'expense';"
```

**두 값이 달라야 정상이다** (거래를 더했으므로). 그리고 화면은 앞의 값을 보여준다.

> 스냅샷 컬럼이 없는 **옛 리포트**는 실시간 집계로 폴백하고 배지도 뜨지 않는다.
> "다시 만들기"를 누르면 해소된다.

---

# 6. AI 리뷰 (S28~S38)

**이 절 전체를 관통하는 규칙 두 가지가 판정 기준이다.**

1. **모든 수치는 SQL 집계다.** LLM 은 주어진 숫자를 문장으로 엮을 뿐, 어떤 수치도
   계산하거나 만들지 않는다
2. **무엇을 지적할지도 LLM 이 고르지 않는다.** 탐지는 `src/lib/signals/` 의 결정론적
   코드가 하고, 우선순위는 원화 영향도가 정한다

그래서 판정은 **카테고리 이름이 무엇인가**가 아니라 **신호 타입이 잡혔는가**와
**서술의 숫자가 payload 와 일치하는가**로 한다.

**전제 — 기본 시리즈를 순서대로 올린다.** 이 셋이 있어야 반복 결제(3회)·구독료
인상·카테고리 급증이 성립한다.

```bash
scripts/browser-test/reset.sh data
for m in 04 05 06; do
run <<EOF
const page = await auth();
console.log((await upload(page, "base-2026-$m.csv", "카드 1", 15000)).slice(0, 200));
EOF
done
```

**기대되는 2026-06 신호 5건** (2026-08-24 실측):

| 타입 | 대상 | 영향도 | 근거 |
|---|---|---|---|
| `outlier_transaction` | 코스트코 결제 | 217,000 | 생활/마트 월 220,100원의 98.6% (≥30%) |
| `category_spike` | 생활/마트 | 163,700 | 56,400 → 220,100 |
| `recurring_price_up` | NETFLIX.COM | 36,000 | 9,900 → 12,900, +30% (≥10%) × 12개월 |
| `category_spike` | 카페/간식 | 33,500 | 14,900 → 48,400 (≥30,000원, +225%) |
| `recurring_payment` | 서울교통공사 | — | 1,450 × 3회, 간격 30·30일, 월 1건 연속 |

인사이트 카드는 영향도 상위 3개이므로 **앞의 세 줄**이 올라온다.
`recurring_payment` 은 영향도가 없어 카드에 오르지 않는다.

**카테고리는 LLM 이 정하므로 카테고리에 기대는 두 줄은 어긋날 수 있다.**
`recurring_*` 은 금액과 날짜만 보므로 분류와 무관하게 재현된다.

> 6월의 큰 결제를 **처음 보는 가맹점**(코스트코)으로 둔 데는 이유가 있다. 이마트로
> 두면 4·5·6월에 각 1건씩 31·34일 간격이 되어 반복 결제 조건에 걸리고, 금액이
> 41,000 → 38,000 → 217,000 이라 **마트 장보기가 `recurring_price_up` 으로** 잡힌다.
> 영향도 2,148,000원으로 우선순위 최상단을 차지해 진짜 신호를 밀어낸다.
> 이것 자체가 결함이다 — `KNOWN_ISSUES` ⓘ 를 볼 것.

## S28 — 업로드 완료 후 인사이트 ✅ 🔍

```bash
run <<'EOF'
const page = await auth();
console.log((await dash(page, 3000)).slice(0, 900));
EOF
```

**화면 판정** 완료 요약 아래 카드 **3장**(4장이 아니다 — 프로토타입과 다른 지점이다).
가장 최근 달의 영향도 상위 3개이고, **영향도가 없는 `recurring_payment` 은 카드에 올리지 않는다.**

**DB 판정** 🔍 **여기가 본체다.** 서술의 숫자와 payload 의 숫자를 대조한다.

```bash
psql -x -c "select type, target_key, impact, payload, narrative
            from spending_signals where period = '2026-06-01' order by impact desc nulls last;"
```

확인할 것:
1. **서술의 모든 숫자가 payload 에 있다.** 없는 숫자가 문장에 있으면 LLM 이 만들어낸 것이다
2. **원시 실수가 문장에 없다.** `0.6864916165770326` 같은 값이 보이면 실패다.
   비율은 정수 퍼센트(`69%`), 금액은 천단위 쉼표(`217,000원`)여야 한다
3. **CSV 에 든 모든 달에 신호가 생겼다.** 카드는 최근 달만 보여주지만 저장은 전부다

```bash
psql -c "select period, type, count(*) from spending_signals group by 1,2 order by 1,2;"
```

---

## S29 — 첫 달이라 비교 대상이 없음 ◻︎

```bash
scripts/browser-test/reset.sh data
run <<'EOF'
const page = await auth();
await upload(page, "single-month.csv", "카드 1", 20000);
console.log((await textOf(page, "/dashboard?month=2025-08", 3000)).slice(0, 700));
EOF
```

**화면 판정** 빈 카드 대신 "다음 달이면 지난달과 비교해 드릴 수 있습니다".

**DB 판정** 5종 중 `outlier_transaction` 만 잡힌다. `category_spike` 나
`recurring_*` 이 첫 달에 잡히면 결함이다 — 비교할 데이터가 없다.

```bash
psql -c "select type, count(*) from spending_signals where period = '2025-08-01' group by 1;"
```

---

## S30 — 반복 지출 확인 ◻︎

**`expired` 에서도 열려야 한다.** LLM 을 쓰지 않으므로 막을 이유가 없다.

```bash
scripts/browser-test/actor.sh u4
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/dashboard/subscriptions", 2500)).slice(0, 700));
EOF
scripts/browser-test/actor.sh u3
```

**화면 판정** 가맹점 · 금액 · 주기 · 지속 개월 표. 만료 상태에서도 내용이 보인다.

**DB 판정** 🔍 가맹점별로 **가장 최근 `period` row 하나만** 읽어야 한다. 여러 달치가
그대로 나오면 같은 구독이 여러 줄로 중복된다.

```bash
psql -c "select target_key, period, payload->>'latestAmount' as amount
         from spending_signals where type like 'recurring%' order by target_key, period;"
```

---

## S31 — 인사이트가 틀림 ◻︎

카드의 "숨기기"를 누른다.

**화면 판정** 카드가 사라지고 **왜 틀렸는지 묻지 않는다.** MVP 는 재학습하지 않으므로
물어보면 지키지 못할 기대를 만든다.

**DB 판정**

```bash
psql -c "select type, target_key, dismissed_at from spending_signals
         where dismissed_at is not null;"
```

**`expired` 에서는 막혀야 한다** — `dismissed_at` 을 쓰는 동작이다.

---

## S32 — 구독료 인상 발견 ◻︎ 🔍

기본 시리즈에서 NETFLIX 가 9,900 → 12,900 으로 오른다.

```bash
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/dashboard/review/2026-06", 3000)).slice(0, 800));
EOF
```

**화면 판정** "넷플릭스 구독료가 9,900원에서 12,900원으로 올랐습니다. 이대로면 1년에
36,000원을 더 내게 됩니다" 형태. **인상분 × 12 로 정렬돼 상위로 올라온다.**

**DB 판정** 🔍 연 환산이 SQL 값과 맞는지 본다.

```bash
psql -x -c "select impact, payload from spending_signals
            where type = 'recurring_price_up' and period = '2026-06-01';"
```

`impact = (12900 - 9900) * 12 = 36000` 이어야 한다. 문장의 36,000원이 이 값과 다르면
LLM 이 계산한 것이다 — 그것이 이 프로젝트에서 가장 피해야 할 실패다.

---

## S33 — 같은 달을 다시 업로드 ◻︎

S31 에서 카드 하나를 숨긴 뒤 같은 달을 다시 올린다.

```bash
run <<'EOF'
const page = await auth();
console.log((await upload(page, "base-2026-06.csv", "카드 1", 20000)).slice(0, 400));
EOF
```

**화면 판정** 새 신호만 더해진다. **숨겼던 카드는 다시 나타나지 않는다.**

**DB 판정** 🔍 유니크 제약으로 중복이 막히고 `dismissed_at` 이 보존된다.

```bash
psql -c "select type, target_key, dismissed_at, created_at
         from spending_signals where period = '2026-06-01' order by type;"
```

같은 `(type, target_key, period)` 가 두 줄이면 유니크가 빠진 것이다.

---

## S35 — 카드에 안 올라온 신호 보기 ◻︎

```bash
run <<'EOF'
const page = await auth();
console.log((await textOf(page, "/dashboard/review/2026-06", 3000)).slice(0, 900));
EOF
```

**화면 판정** 그 달 신호 **전부**가 영향도 순으로 나오고, `recurring_payment` 은
영향도가 없어 **목록 아래 별도 섹션**에 놓인다:
"반복 결제 — 평소 그 자체라 인사이트 카드에 올리지 않습니다"

`expired` 에서도 열려야 한다.

---

## S36 — 문장의 근거 확인 ◻︎ 🔍

```bash
run <<'EOF'
const page = await auth();
await go(page, "/dashboard/review/2026-06", 2500);
const href = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) => /review\/[^/]+\/[0-9a-f-]{36}/.test(x.href));
  return a ? a.href : null;
});
console.log("신호 상세:", href);
if (href) { await page.goto(href, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 900)); }
EOF
```

**화면 판정 네 가지** — 문장 · 근거 거래 표(해당 행 강조) · 판정 수치 4개 ·
"왜 이 조건인가" 해설.

**LLM 을 호출하지 않아야 한다.** 근거 거래는 SQL, 조건 해설은 `thresholds.ts` 값을
끼운 고정 문구다. 이 화면을 열 때 OpenAI 요청이 나가면 결함이다.

```bash
tail -40 /tmp/finsight-dev.log | grep -i "openai\|chat/completions" || echo "LLM 호출 없음 ✓"
```

조건 해설의 숫자가 `thresholds.ts` 와 일치하는지 본다. 임계값이 두 곳에 적혀 있으면
한쪽만 고쳐지는 날이 온다.

```bash
grep -n "minShareOfCategory\|minAmountKrw\|minCategoryMonthlyKrw" src/lib/signals/thresholds.ts
```

---

## S37 — 분류를 고친 뒤 ◻︎ 🔍

S4 로 분류를 고친 다음.

**화면 판정** 안내 문구가 **"분류를 고치면 대시보드가 다시 계산됩니다"** 로 좁혀져 있다.
"AI 리뷰가 그 자리에서 다시 계산됩니다" 라고 쓰여 있으면 **지키지 못할 약속**이다.

**DB 판정** 🔍 대시보드 집계는 바뀌고 **신호는 그대로**여야 한다. 신호는 업로드
시점에만 만들어진다.

```bash
psql -c "select type, target_key, created_at from spending_signals
         where period = '2026-06-01' order by created_at;"
```

`created_at` 이 분류 수정 시각으로 갱신됐다면 신호를 다시 만든 것이다.

---

## S38 — 없는 신호 ID로 접근 ◻︎

```bash
run <<'EOF'
const page = await auth();
const t = await textOf(page,
  "/dashboard/review/2026-06/00000000-0000-0000-0000-000000000000", 2000);
console.log(t.slice(0, 300));
EOF
```

**화면 판정** "이 신호를 찾을 수 없습니다" + "리뷰로 돌아가기". 500 이나 빈 화면이면 결함이다.

**남의 신호 ID 로도 404 여야 한다.** 다른 사용자의 신호가 열리면 RLS 가 뚫린 것이다.

---

# 부록 A — 픽스처 색인

| 파일 | 쓰는 시나리오 | 무엇 |
|---|---|---|
| `base-2026-04.csv` | S25 · S28~S37 전제 | 기준 달. 반복 결제 1회차 |
| `base-2026-05.csv` | S6 · S25 · S28~S37 전제 | 반복 2회차 |
| `base-2026-06.csv` | S2 · S15 · S24 · S33 | 반복 3회차 + 넷플릭스 인상 + 이상 결제 + 카페 급증 |
| `base-2026-07.csv` | S3 | 다음 달 |
| `card-b-2026-06.csv` | S24 · S24b | 다른 카드사 헤더. 기본 시리즈와 한 줄이 겹친다 |
| `add-one-2026-06.csv` | S23 | 리포트 생성 후 더할 한 건 |
| `single-month.csv` | S21 · S29 | 한 달치뿐. `outlier_transaction` 만 잡힌다 |
| `opaque-headers.csv` | S9 · S10 | 헤더에서 뜻을 읽을 수 없다 |
| `partial-broken.csv` | S12 | 12행 중 2행 실패 (16.7% — 20% 이하) |
| `mostly-broken-dates.csv` | S12b(a) | 날짜 실패 75% → `needs_mapping` |
| `mostly-broken-amounts.csv` | S12b(b) | 금액 실패 75% → `failed` |
| `future-dates.csv` | S12c · S14 | 2099년. 이 픽스처는 낡지 않는다 |
| `too-old.csv` | S12c | 2005년 |
| `zero-amounts.csv` | S12c | 금액 0원이 50% |
| `header-only.csv` | S12c | 헤더만. "거래가 없는 파일입니다." |
| `empty.csv` | S16 | 0바이트 |
| `fake.xlsx` | S16 | 확장자만 xlsx |
| `refund-deposit.csv` | S12d | 취소·할부취소·입금이 섞여 있다 |
| `unknown-merchants.csv` | S13 | 전역 캐시에 없고 뜻을 알 수 없는 가맹점 |
| `euckr.csv.b64` | S17 | EUC-KR. `attachBase64()` 로 넣는다 |
| `ambiguous-date.csv` | S34(a) | `MM/DD/YYYY` 로 확정 가능 |
| `unresolvable-date.csv` | S34(b) | 끝까지 구분되지 않는다 |

# 부록 B — 액터별 실행 순서

한 번에 훑을 때 이 순서면 액터 전환이 가장 적다.

| 순서 | 액터 | 시나리오 |
|---|---|---|
| 1 | U1 (쿠키 없음) | S1 · S26 |
| 2 | U2 (`reset.sh data` + `actor.sh u3`) | S2 · S16 · S21 · S29 |
| 3 | U3 (기본 시리즈 04~06 업로드) | S3~S6 · S9~S17 · S22~S25 · S28 · S31~S37 |
| 4 | U4 (`actor.sh u4`) | S18 · S19 · S20 · S30 · S32 · S35 · S36 · S38 (읽기 확인) |
| 5 | U5 (`actor.sh u5`) | S7 · 쓰기 재확인 |
| 6 | U6 (`actor.sh u6`) | S8 · `canceled` 기간 내 쓰기 허용 확인 |
| 7 | U3 로 복귀 후 마지막 | **S27** (파괴적 — 백업 먼저) |

**S27 은 반드시 마지막이다.** 다른 시나리오의 데이터를 전부 지운다.

# 부록 C — 알려진 결함이 걸리는 시나리오

`docs/KNOWN_ISSUES.md` 의 9건이다. **이 방식으로 실패하는 것은 새 결함이 아니다.**

| 결함 | 걸리는 시나리오 | 어떻게 보이나 |
|---|---|---|
| ⓐ 월 칩 4개 제한 | S3 · S22 | 5개월 이전은 URL 을 직접 쳐야 열린다 |
| ⓑ `assumed-iso` 오라벨 | S34 · **모든 업로드** | "구분되지 않아 이 형식으로 가정했습니다" 가 늘 뜬다 |
| ⓒ `pending` 영구 잔존 | S6 · S25 | "업로드 중 15%" 고정. `networkidle` 이 영영 안 온다 |
| ⓓ 내부 문구 노출 | S6 | "job row는 있고 파일은 아직 Storage에 없습니다" |
| ⓔ 카드에 job UUID | S6 · S25 | 파일명 대신 UUID |
| ⓕ 실패 job 요약 | S12c · S14 | "완료 후 표시됩니다" 가 실패에도 남는다 |
| ⓖ 카드 오지정 경고 반복 | S24b | 한 번 뜨면 계속 뜬다 (**원인 미확정**) |
| ⓗ 배수 비율이 원시 실수로 | S28 · S32 · S35 | "증가 비율은 2.902482269503546이며" |
| ⓘ 마트가 구독료 인상으로 | S28 · S32 | 영향도 1위를 차지해 진짜 신호를 밀어낸다 |

# 부록 D — 한 바퀴 돌린 뒤

```bash
scripts/browser-test/reset.sh jobs     # 실패 카드 정리
scripts/browser-test/actor.sh u3       # 액터를 기본으로
```

`.env.local` 을 지우면 프로덕션으로 되돌아간다. **브라우저 테스트를 이어갈 생각이면
지우지 않는다** — 지운 채로 테스트하면 프로덕션 DB 를 때린다.

결과를 남길 때는 **통과·미통과·미확인을 구분해서** 적는다. "검증 통과"는 검증 명령과
그 출력을 함께 적을 수 있을 때만 쓴다.
