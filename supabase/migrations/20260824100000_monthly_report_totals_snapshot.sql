-- 리포트 문단은 생성 시점의 집계로 쓰인다. 상단 통계를 실시간 집계로 그리면
-- 같은 화면에 총지출이 둘이 되므로, 문단이 쓴 숫자를 함께 저장한다.
-- 기존 행에는 값이 없으므로 nullable 이고, 화면은 없을 때 실시간 집계로 돌아간다.
alter table public.monthly_reports
  add column if not exists total_expense bigint,
  add column if not exists previous_total_expense bigint,
  add column if not exists transaction_count integer;
