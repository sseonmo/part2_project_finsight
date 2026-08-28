# Google 로그인 설정 — 프로덕션 Supabase

FinSight 의 유일한 로그인 수단은 Google OAuth 다. **코드는 이미 전부 있다.**
없는 것은 Google 자격증명과 그것을 Supabase 에 물리는 콘솔 설정뿐이며, 이 문서는
그 설정을 어디에 무슨 값으로 넣는지를 다룬다. 설정을 마치면 코드 변경 없이 동작한다.

**2026-08-29 에 아래 절차를 그대로 거쳐 프로덕션 로그인이 동작하는 것을 확인했다.**
이미 설정이 끝난 상태이므로, 이 문서는 재현·복구·다른 환경 설정을 위한 기록이다.

관련 코드 — `src/app/(marketing)/page.tsx`(로그인 시작) ·
`src/app/auth/callback/route.ts`(코드 교환·프로필 생성) · `src/middleware.ts`(보호 라우트).

---

## 지금 무엇이 설정돼 있나

| 항목 | 값 |
|---|---|
| Google Cloud 프로젝트 | `finsight` (`finsight-506915`) |
| OAuth 클라이언트 | `FinSight Web` (웹 애플리케이션) |
| Client ID | `382040574524-l00drtlmqboauuogpt45tvrmrpvk39ic.apps.googleusercontent.com` |
| 게시 상태 | **테스트 중** — 테스트 사용자에 등록된 계정만 로그인된다 |
| 테스트 사용자 | `mo3509@gmail.com` |
| Supabase provider | Google 활성화, Site URL·Redirect URLs 등록 완료 |

Client Secret 은 Supabase 에만 있고 어디에도 기록하지 않는다. 분실하면 Google 콘솔에서
새로 발급해 Supabase 에 다시 넣는다(클라이언트를 다시 만들 필요는 없다).

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

콘솔이 개편돼 OAuth 설정은 **`API 및 서비스` 가 아니라 `Google 인증 플랫폼`** 아래에 있다
(좌측 메뉴: 개요 · 브랜딩 · 대상 · 클라이언트 · 데이터 액세스). 옛 문서의
"OAuth 동의 화면" 은 `브랜딩` + `대상` 으로 쪼개졌다.

1. **프로젝트 생성** — 상단 프로젝트 선택기 → `새 프로젝트`, 이름 `finsight`.
   다른 용도의 기존 프로젝트에 얹지 않는 편이 낫다. 동의 화면은 프로젝트 단위라
   한쪽을 고치면 다른 앱이 같이 영향을 받는다.

2. **OAuth 구성 마법사** — `Google 인증 플랫폼` → `개요` → `시작하기`.
   네 단계를 순서대로 받는다.
   - 앱 정보: 앱 이름 `FinSight`, 사용자 지원 이메일(드롭다운에서 본인 계정)
   - 대상: **외부**
   - 연락처 정보: 본인 이메일
   - 완료: `Google API 서비스: 사용자 데이터 정책` 동의 체크

   범위(scope)는 **어디에도 추가하지 않는다.** Supabase 가 요청하는
   `email` · `profile` 은 기본 범위라 등록이 필요 없다(실제 리다이렉트의
   `scope` 파라미터가 `email profile` 뿐인 것으로 확인했다).

3. **테스트 사용자 추가** — `대상` → `테스트 사용자` → `Add users`.
   앱이 `테스트 중` 이면 **여기 없는 계정은 로그인 자체가 거부된다.**
   개인 프로젝트는 테스트 상태로 두는 편이 낫다 — `앱 게시` 를 누르면 Google 검증
   절차가 따라온다. 테스트 상태의 한도는 사용자 100명이다.

   > `대상` 페이지에 "앱의 OAuth 구성이 완료되지 않았습니다 … 브랜딩 페이지로 이동" 이라는
   > 노란 경고가 남아 있을 수 있다. 이것은 **앱 게시(프로덕션 전환) 요건**이고,
   > 테스트 상태의 로그인은 이 경고가 있어도 정상 동작한다.

4. **웹 클라이언트 생성** — `클라이언트` → `클라이언트 만들기`
   - 애플리케이션 유형: **웹 애플리케이션**, 이름은 식별용이라 무엇이든 된다
   - 승인된 JavaScript 원본 2개, 승인된 리디렉션 URI 1개 — 위 표의 값을 그대로
   - 만들면 **클라이언트 ID** 와 **보안 비밀번호**가 대화상자에 뜬다.
     **이 대화상자를 닫으면 보안 비밀번호를 다시 볼 수 없다.** 2단계를 끝낼 때까지 닫지 않는다

> 반영에 몇 분 걸릴 수 있다. 방금 만든 직후 `redirect_uri_mismatch` 가 나오면
> 값을 의심하기 전에 5분 뒤 다시 해 본다.

---

## 2단계 — Supabase 대시보드

프로젝트 `finsight` (`rokvlbizwfdqsmzojesq`).

1. **Google provider 활성화** —
   <https://supabase.com/dashboard/project/rokvlbizwfdqsmzojesq/auth/providers>
   - 목록에서 `Google` 을 열고 `Enable Sign in with Google` 을 켠다
   - `Client IDs` 에 클라이언트 ID, `Client Secret (for OAuth)` 에 보안 비밀번호를 넣고 `Save`
   - 이 화면 아래쪽 `Callback URL (for OAuth)` 이 1단계에 넣은 값과 **문자 그대로
     같은지** 확인한다. 다르면 그 화면의 값이 옳다
   - `Skip nonce checks` 와 `Allow users without an email` 은 끈 채로 둔다

2. **URL 등록** —
   <https://supabase.com/dashboard/project/rokvlbizwfdqsmzojesq/auth/url-configuration>
   - `Site URL` 에 앱 도메인 (기본값이 `http://localhost:3000` 이라 반드시 바꿔야 한다)
   - `Redirect URLs` → `Add URL` 에 `/auth/callback` 두 개

   **Redirect URLs 가 비어 있으면 로그인이 조용히 어긋난다.** 목록에 없는 주소로는
   되돌려 보내지 않고 `Site URL` 로 보내 버리기 때문에, 프로덕션에서 로그인했는데
   localhost 로 튕기는 형태로 나타난다.

---

## 3단계 — 검증

**먼저 provider 가 켜졌는지 한 줄로 본다.** 브라우저를 열기 전에 이것부터 한다 —
설정 누락과 값 오타를 여기서 갈라낸다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "$(grep -E '^NEXT_PUBLIC_SUPABASE_URL' .env | cut -d= -f2-)/auth/v1/authorize?provider=google"
```

- `302` — 켜졌다
- `400` — 아직 꺼져 있다(`provider is not enabled`). 2단계-1 을 다시 본다.
  2026-08-29 설정 전 상태가 이것이었다

**그다음 Supabase 가 실제로 만드는 리다이렉트를 뜯어본다.** 여기까지 맞으면 브라우저를
열기 전에 오설정이 거의 다 걸러진다.

```bash
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL' .env | cut -d= -f2-)
curl -s -o /dev/null -w "%{redirect_url}" \
  "$URL/auth/v1/authorize?provider=google" |
  python3 -c "
import sys, urllib.parse as u
p = u.urlparse(sys.stdin.read().strip()); q = u.parse_qs(p.query)
print('host        :', p.netloc + p.path)
print('client_id   :', q.get('client_id', ['(없음)'])[0])
print('redirect_uri:', q.get('redirect_uri', ['(없음)'])[0])
print('scope       :', q.get('scope', ['(없음)'])[0])"
```

`accounts.google.com/o/oauth2/v2/auth` 로 가고, `redirect_uri` 가 Google 에 등록한
Supabase 콜백과 같고, `scope` 가 `email profile` 이면 맞다.

**마지막으로 실제 로그인.** 프로덕션 도메인에서 한다(로컬은 아래 "함정" 첫 항목 때문에
준비가 더 필요하다).

1. <https://part2-project-finsight.vercel.app> 을 **시크릿 창**으로 연다
   (기존 세션이 있으면 미들웨어가 곧장 `/dashboard` 로 보내 로그인 화면을 못 본다)
2. `Google로 시작하기` → 계정 선택 → 동의
3. `/dashboard` 에 도달하면 성공이다
4. 사용자와 프로필이 만들어졌는지 확인한다

```bash
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2-)
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
curl -s "$URL/rest/v1/profiles?select=user_id,subscription_status,trial_started_at&order=trial_started_at.desc&limit=3" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | python3 -m json.tool
```

`subscription_status` 가 `trialing` 이고 `trial_started_at` 이 방금 시각이면 끝이다.
`auth/v1/admin/users` 를 같은 키로 조회하면 `provider` 가 `google` 인지도 볼 수 있다.

---

## 함정

**① `.env.local` 이 있으면 로컬은 프로덕션 Supabase 를 보지 않는다.**
그 파일은 브라우저 테스트용으로 `NEXT_PUBLIC_SUPABASE_URL` 을 `http://127.0.0.1:54321`
로 덮는다. 로컬에서 진짜 Google 로그인을 시험하려면 파일을 잠시 옮겨야 하고
(`mv .env.local .env.local.off`), 그동안 브라우저 테스트 환경은 쓸 수 없다.
로컬 Supabase 에서 Google 로그인을 쓰려면 `supabase/config.toml` 에
`[auth.external.google]` 을 따로 추가하고 Google 쪽 승인된 리디렉션 URI 에
`http://127.0.0.1:54321/auth/v1/callback` 을 더해야 한다 — 지금은 둘 다 없다.

**② 로그인이 되는데 `authError` 를 달고 랜딩으로 되돌아온다면** OAuth 가 아니라
`/auth/callback` 이후를 본다. `profiles` upsert 실패도 같은 화면으로 나온다.
메시지 문구로 어느 단계인지 갈린다(`src/app/auth/callback/route.ts`).

**③ 로그인 화면이 아예 안 뜨고 즉시 `/dashboard` 로 간다면** 이미 세션이 있는 것이다.
미들웨어가 `/` 접속을 리다이렉트한다. 시크릿 창을 쓴다.

**④ 계정을 지우고 다시 시험할 때** `auth.users` 만 지우면 `profiles` 가 남아 다음
로그인의 upsert 가 기존 행을 만난다. 재현 조건을 맞추려면 둘 다 지운다.

**⑤ 본인 말고 다른 사람이 로그인하려면** `대상` → `테스트 사용자` 에 그 계정을 먼저
추가해야 한다. 빠뜨리면 Google 동의 화면 대신 `access_denied` 가 뜬다.
