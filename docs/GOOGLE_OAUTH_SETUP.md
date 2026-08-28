# Google 로그인 설정 — 프로덕션 Supabase

FinSight 의 유일한 로그인 수단은 Google OAuth 다. **코드는 이미 전부 있다.**
없는 것은 Google 자격증명과 그것을 Supabase 에 물리는 콘솔 설정뿐이며, 이 문서는
그 설정을 어디에 무슨 값으로 넣는지를 다룬다. 설정을 마치면 코드 변경 없이 동작한다.

관련 코드 — `src/app/(marketing)/page.tsx`(로그인 시작) ·
`src/app/auth/callback/route.ts`(코드 교환·프로필 생성) · `src/middleware.ts`(보호 라우트).

---

## 붙여넣을 값

이 네 개가 전부다. **오타 하나가 `redirect_uri_mismatch` 로 돌아온다.**

| 어디에 | 값 |
|---|---|
| Google — 승인된 리디렉션 URI | `https://rokvlbizwfdqsmzojesq.supabase.co/auth/v1/callback` |
| Google — 승인된 JavaScript 원본 | `https://part2-project-finsight.vercel.app`<br>`http://localhost:3000` |
| Supabase — Site URL | `https://part2-project-finsight.vercel.app` |
| Supabase — Redirect URLs | `https://part2-project-finsight.vercel.app/auth/callback`<br>`http://localhost:3000/auth/callback` |

**리디렉션 URI 는 앱 도메인이 아니라 Supabase 도메인이다.** Google 은 사용자를 우리
앱이 아니라 Supabase Auth 로 돌려보내고, Supabase 가 다시 우리 `/auth/callback` 으로
보낸다. 여기에 앱 주소를 적으면 로그인이 끝까지 가지 않는다.

**앱 도메인은 `part2-project-finsight.vercel.app` 하나뿐이다.** 배포마다 생기는
`part2-project-finsight-<해시>-sseons-projects.vercel.app` 은 Vercel SSO 가 302 로
가로채므로 OAuth 리턴이 통과하지 못한다. 자세한 경위는 프로젝트 메모리의
"SSO 보호는 프로덕션 기본 도메인만 통과시킨다" 항목에 있다.

---

## 1단계 — Google Cloud Console

<https://console.cloud.google.com/>

1. **프로젝트 생성** — 상단 프로젝트 선택기 → `새 프로젝트`. 이름은 `finsight`.
   기존 프로젝트가 있으면 재사용해도 된다.

2. **동의 화면 구성** — 좌측 `API 및 서비스` → `OAuth 동의 화면`
   (개편된 콘솔에서는 `Google Auth Platform` → `Branding` / `Audience`).
   - User Type / Audience: **External**
   - 앱 이름 `FinSight`, 지원 이메일과 개발자 연락처는 본인 Gmail
   - 범위(scope)는 **추가하지 않는다.** Supabase 가 요청하는 `email` · `profile` ·
     `openid` 는 기본 범위라 등록이 필요 없다.

3. **테스트 사용자 추가** — `Audience`(또는 동의 화면의 `테스트 사용자`) 에서
   로그인에 쓸 Google 계정을 추가한다.
   앱이 `테스트` 상태면 **여기 없는 계정은 `access_denied` 로 거부된다.**
   개인 프로젝트는 테스트 상태로 두는 편이 낫다 — `프로덕션` 으로 게시하면
   Google 검증 절차가 따라온다.

4. **웹 클라이언트 생성** — `사용자 인증 정보` → `사용자 인증 정보 만들기` →
   `OAuth 클라이언트 ID` (개편된 콘솔에서는 `Clients` → `Create client`)
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본 2개, 승인된 리디렉션 URI 1개 — 위 표의 값을 그대로
   - 만들면 **클라이언트 ID** 와 **클라이언트 보안 비밀번호**가 나온다. 다음 단계에서 쓴다.

> 반영에 몇 분 걸릴 수 있다. 방금 만든 직후 `redirect_uri_mismatch` 가 나오면
> 값을 의심하기 전에 5분 뒤 다시 해 본다.

---

## 2단계 — Supabase 대시보드

프로젝트 `finsight` (`rokvlbizwfdqsmzojesq`).

1. **Google provider 활성화** —
   <https://supabase.com/dashboard/project/rokvlbizwfdqsmzojesq/auth/providers>
   - 목록에서 `Google` 을 펼치고 `Enable Sign in with Google` 을 켠다
   - `Client IDs` 에 클라이언트 ID, `Client Secret` 에 보안 비밀번호를 넣고 저장
   - 이 화면에 표시되는 `Callback URL (for OAuth)` 이 1단계에 넣은 값과 **문자 그대로
     같은지** 확인한다. 다르면 그 화면의 값이 옳다

2. **URL 등록** —
   <https://supabase.com/dashboard/project/rokvlbizwfdqsmzojesq/auth/url-configuration>
   - `Site URL` 에 앱 도메인
   - `Redirect URLs` 에 `/auth/callback` 두 개를 각각 추가

   Redirect URLs 에 없는 주소로는 Supabase 가 되돌려 보내지 않는다.
   로컬에서 로그인해 볼 계획이 없더라도 `http://localhost:3000/auth/callback` 은
   넣어 두는 편이 낫다 — 나중에 원인을 찾기 어려운 종류의 실패다.

---

## 3단계 — 검증

**먼저 provider 가 켜졌는지 한 줄로 본다.** 브라우저를 열기 전에 이것부터 한다 —
설정 누락과 값 오타를 여기서 갈라낸다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$(grep -E '^NEXT_PUBLIC_SUPABASE_URL' .env | cut -d= -f2-)/auth/v1/authorize?provider=google"
```

- `302` — 켜졌다. 3단계를 계속한다
- `400` — 아직 꺼져 있다(`provider is not enabled`). 2단계-1 을 다시 본다.
  2026-08-29 설정 전 상태가 이것이었다

그다음 **프로덕션 도메인에서** 실제로 로그인해 본다. 로컬은 아래 "함정" 첫 항목 때문에
준비가 더 필요하다.

1. <https://part2-project-finsight.vercel.app> 을 **시크릿 창**으로 연다
   (기존 세션이 있으면 미들웨어가 곧장 `/dashboard` 로 보내 로그인 화면을 못 본다)
2. `Google로 시작하기` → 계정 선택 → 동의
3. `/dashboard` 에 도달하면 성공이다
4. 프로필 행이 생겼는지 확인한다

```sql
select user_id, subscription_status, trial_started_at
from profiles
order by trial_started_at desc
limit 1;
```

`subscription_status = 'trialing'` 이고 `trial_started_at` 이 방금 시각이면 끝이다.

---

## 함정

**① `.env.local` 이 있으면 로컬은 프로덕션 Supabase 를 보지 않는다.**
그 파일은 브라우저 테스트용으로 `NEXT_PUBLIC_SUPABASE_URL` 을 `http://127.0.0.1:54321`
로 덮는다. 로컬에서 진짜 Google 로그인을 시험하려면 파일을 잠시 옮겨야 하고
(`mv .env.local .env.local.off`), 그동안 브라우저 테스트 환경은 쓸 수 없다.
로컬 Supabase 에서 Google 로그인을 쓰려면 `supabase/config.toml` 에
`[auth.external.google]` 을 따로 추가해야 한다 — 지금은 없다.

**② 로그인이 되는데 `authError` 를 달고 랜딩으로 되돌아온다면** OAuth 가 아니라
`/auth/callback` 이후를 본다. `profiles` upsert 실패도 같은 화면으로 나온다.
메시지 문구로 어느 단계인지 갈린다(`src/app/auth/callback/route.ts`).

**③ 로그인 화면이 아예 안 뜨고 즉시 `/dashboard` 로 간다면** 이미 세션이 있는 것이다.
미들웨어가 `/` 접속을 리다이렉트한다. 시크릿 창을 쓴다.

**④ 계정을 지우고 다시 시험할 때** `auth.users` 만 지우면 `profiles` 가 남아 다음
로그인의 upsert 가 기존 행을 만난다. 재현 조건을 맞추려면 둘 다 지운다.
