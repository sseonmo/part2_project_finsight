# 프로젝트: FinSight

CSV 거래내역·카드명세서를 업로드하면 자동으로 분류해 지출 대시보드와 월간 리포트를 보여주는 개인 가계부 SaaS.

## 기술 스택
- Next.js 15 (App Router)
- TypeScript strict mode
- Tailwind CSS
- Supabase (Postgres + Auth + Storage)
- Inngest (백그라운드 job)
- OpenAI API — 가맹점 분류는 `gpt-5.6-luna`, 컬럼 매핑 추론과 리포트/인사이트 서술은 `gpt-5.6-terra`
- Polar (결제, Merchant of Record)
- Vercel (배포)

## 아키텍처 규칙
- CRITICAL: 외부 API 호출(OpenAI, Polar, Supabase service role)은 `src/app/api/` 라우트 핸들러와 `src/inngest/` 함수에서만 처리할 것. 클라이언트 컴포넌트에서 직접 호출하지 말 것
- CRITICAL: 리포트와 AI 리뷰(인사이트 카드·코칭 문단)의 모든 수치는 SQL 집계 결과다. LLM은 주어진 숫자를 문장으로 엮기만 하고 어떤 수치도 계산하거나 생성하지 말 것. 이유: 틀린 금액을 그럴듯한 문장으로 제시하면 가계부 앱의 신뢰가 한 번에 무너진다
- CRITICAL: **무엇을 지적할지도 LLM이 고르지 않는다.** 신호 탐지는 결정론적 코드(`src/lib/signals/` — SQL이 원시 집계, 순수 함수가 판정)가 하고, 우선순위는 원화 영향도 점수가 정한다. LLM은 이미 선별된 신호를 받아 문장으로 옮길 뿐이다. 임계값은 `src/lib/signals/thresholds.ts` 한 파일에만 둘 것. 이유: 선별까지 LLM에 맡기면 결과가 재현되지 않아 테스트할 수 없고, 근거 없는 지적을 추측으로 채우게 된다
- CRITICAL: LLM 분류 호출 단위는 거래가 아니라 **미매칭 고유 가맹점 100개 배치**다. 거래 1건당 LLM을 호출하지 말 것. 신호 서술도 업로드당 배치 1회로 끝낼 것. 이유: 개인 가계부는 객단가가 낮아 거래당 LLM 비용이 곧 마진이다
- CRITICAL: 전역 캐시 `merchant_categories`에는 가맹점명과 카테고리만 저장할 것. 금액·날짜·`user_id`를 넣지 말 것. 사용자의 카테고리 수정은 `user_category_overrides`에만 반영하고 전역 캐시를 덮어쓰지 말 것. 이유: 한 사용자의 개인 데이터와 분류 취향이 전체 사용자에게 전파된다
- CRITICAL: `csv_format_fingerprints`는 **개인 범위**다(`(user_id, 헤더 해시)`). 컬럼 매핑을 전역으로 공유하지 말 것. 이유: 한 사람이 날짜 컬럼을 잘못 고르면 같은 카드사 CSV를 올리는 모든 사용자의 거래가 엉뚱한 달로 들어간다. 개인 캐시만으로도 "같은 사람이 매달 같은 형식을 올리는" 주 패턴에서 LLM 호출이 사라진다
- CRITICAL: 업로드 원본 파일은 Next.js 서버를 통과하지 않는다. 서명 URL로 클라이언트가 Supabase Storage에 직접 업로드하고, 읽기는 Inngest 워커만 할 것. **Storage 키의 파일명은 서버가 생성**하고 클라이언트가 준 이름은 DB 컬럼에만 저장할 것. 이유: 클라이언트가 키 문자열을 정하면 다른 사용자 경로에 쓸 수 있고, 서명이 그 조작을 승인해 버린다
- CRITICAL: 구독·체험 권한 판정은 서버 유틸 한 곳(`src/lib/entitlement.ts`)에서만 할 것. 클라이언트에서 버튼을 숨기는 것은 게이트가 아니다. **`subscription_status` 문자열을 직접 비교하지 말 것** — `canceled`는 기간 내에는 `active`와 같은 권한이고, 체험 만료는 상태 컬럼이 아니라 `trial_started_at`으로 계산한다
- CRITICAL: 외부에서 호출되는 엔드포인트(`/api/inngest`, Polar 웹훅)는 **서명 검증을 통과한 요청만 처리할 것.** 웹훅은 이벤트 ID로 멱등 처리하고, `/api/uploads/:id` 계열은 전부 job 소유자를 확인할 것. 이유: 이 경로들은 service role로 DB에 쓰므로 RLS가 막아주지 않는다. 검증이 없으면 결제 없이 구독이 켜지고 남의 업로드를 조작할 수 있다
- CRITICAL: 가맹점명은 사용자가 CSV로 넣는 문자열이며 그대로 LLM 프롬프트에 들어간다. 프롬프트에 싣기 전 **길이 상한·개행/제어문자 제거**를 거치고, 분류 출력은 **카테고리 10종 enum으로 강제**해 벗어난 값은 `기타`로 폴백할 것. 이유: 조작된 분류가 전역 캐시에 저장되면 한 사람이 전체 사용자의 분류를 오염시킨다
- 모델명은 `src/services/openai.ts` 상수에만 두고 호출 지점에 문자열로 박지 말 것. **세 호출을 한 모델로 통일하지 말 것** — 분류는 비용 지배적이라 최저가(`luna`), 컬럼 매핑은 틀리면 거래가 통째로 엉뚱한 달로 가고 그 오답이 개인 캐시에 굳으므로 상위(`terra`)다 (ADR-008)
- 모든 사용자 데이터 테이블에 RLS를 걸 것 (`user_id = auth.uid()`)
- 컴포넌트는 `src/components/`, 타입은 `src/types/`, 외부 API 래퍼는 `src/services/`, 순수 로직은 `src/lib/` 에 분리할 것

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)
- OpenAI 호출은 테스트에서 모킹할 것. 실제 API를 호출하는 테스트는 CI에서 제외할 것

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
npx vercel       # preview 배포 (커밋 없이 확인할 때)
npx vercel --prod # production 배포

배포는 GitHub push로 자동 실행된다(`main` → production, 브랜치 → preview). 위 CLI는 커밋 없이 확인할 때만 쓴다.
