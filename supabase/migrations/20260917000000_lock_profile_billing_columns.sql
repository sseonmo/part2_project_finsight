-- profiles 의 subscription_status·trial_started_at·current_period_end 는 권한 판정
-- (src/lib/entitlement.ts)의 입력이다. 기존 정책은 user_id 만 검사해서, 로그인한
-- 사용자가 PATCH /rest/v1/profiles 로 subscription_status 를 'active' 로 바꾸거나
-- 행을 지우고 다시 넣어 체험을 되돌릴 수 있었다. 결제 없이 권한이 켜진다.
--
-- 이 컬럼을 쓰는 곳은 Polar 웹훅(service role)뿐이다. 사용자 권한으로 쓰는 곳은
-- 로그인 콜백(src/app/auth/callback/route.ts)의 upsert(ignoreDuplicates) 하나이고,
-- 이는 INSERT ... ON CONFLICT DO NOTHING 이라 INSERT 권한만 필요하다.
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

revoke update, delete on public.profiles from anon, authenticated;

-- 최초 생성은 새 체험 행 한 가지 모양만 허용한다. 콜백은 서버 시각을 보내므로
-- DB 시각과의 차이를 1분까지 허용한다.
drop policy if exists profiles_insert_own on public.profiles;

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and subscription_status = 'trialing'
    and polar_customer_id is null
    and current_period_end is null
    and trial_started_at <= now() + interval '1 minute'
  );
