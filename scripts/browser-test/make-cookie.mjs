/**
 * 로컬 Supabase 에 테스트 유저로 로그인해 브라우저에 심을 세션 쿠키를 뽑는다.
 *
 * 쿠키 형식을 손으로 만들지 않는 것이 요점이다 — @supabase/ssr 에 메모리 쿠키
 * jar 를 물리고 signInWithPassword 를 부르면 라이브러리가 쓰려는 쿠키가 그대로
 * 나온다. 이름(`sb-127-auth-token`)도 값의 `base64-` 접두어도 추측하지 않는다.
 *
 * 사용법 (프로젝트 루트에서):
 *   ANON=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2) \
 *     node scripts/browser-test/make-cookie.mjs > ~/.dev-browser/tmp/session-cookies.json
 */
import { createServerClient } from "../../node_modules/@supabase/ssr/dist/main/index.js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.ANON;
const EMAIL = process.env.TEST_EMAIL ?? "e2e-test@finsight.app";
const PASSWORD = process.env.TEST_PASSWORD ?? "e2e-test-pw-1234";

if (!ANON) {
  console.error("ANON 이 비었다. `npx supabase status` 의 anon key 를 넣어라.");
  process.exit(1);
}

const jar = new Map();

const supabase = createServerClient(SUPABASE_URL, ANON, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
  },
});

const { data, error } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});

if (error) {
  console.error("로그인 실패:", error.message);
  process.exit(1);
}

console.error(`user ${data.user.id} · 쿠키 ${jar.size}개`);

process.stdout.write(
  JSON.stringify([...jar.entries()].map(([name, value]) => ({ name, value }))),
);
