-- Polar 웹훅 멱등 처리용 이벤트 원장.
-- 사용자 데이터가 아니라 user_id 기준 정책이 성립하지 않는다.
-- 접근 주체는 웹훅 라우트(service role)뿐이므로 RLS 를 켜되 정책을 만들지 않는다.
create table public.processed_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.processed_webhook_events enable row level security;
