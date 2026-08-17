# design/

`prototype/` 은 Claude Design(claude.ai/design)에서 받은 **핸드오프 번들 원본**이다. 이 저장소의 `docs/PRD.md` 로 만든 화면 9종 목업이고, 지금 설계 문서에 적힌 색·타이포·레이아웃의 출처다.

## 이건 정본이 아니다

**정본은 `docs/DESIGN.md` 다.** 여기 있는 파일은 참고용 원본이고, 프로토타입과 실제 구현이 다르게 가기로 한 곳이 여럿이다. 값이 부딪히면 `docs/` 가 이긴다.

| 프로토타입 | 실제 구현 | 어디에 |
|---|---|---|
| 업로드가 전체 화면 3단계 | `/dashboard` 안 다이얼로그 | USER_FLOW |
| 매번 컬럼 매핑 확인 | 정상 경로엔 없음. 실패했을 때만 | ADR-001 |
| 인사이트 카드 4장 | 3장 | USER_FLOW S28 |
| Hanken Grotesk | Pretendard | DESIGN "타이포그래피" |
| 노란 타일 + 워드마크 | 워드마크만 | DESIGN "앱 셸" |
| 카테고리 색 한 벌 | 모드별 두 벌 (4개 값이 다름) | DESIGN "카테고리 색 10종" |
| 신호 5종을 브라우저 JS로 계산 | 결정론적 SQL | ARCHITECTURE "AI 리뷰" |

프로토타입이 **그리지 않은** 화면·요소 11건은 USER_FLOW "프로토타입이 생략한 것"에 있다. 카드 선택(`card_label`), 진행률 표시, 완료 요약의 네 번째 숫자, 계정 삭제 같은 것들이라 그대로 옮기면 통째로 누락된다.

## 고치지 않는다

`prototype/` 아래 파일의 **내용은** 받은 상태 그대로 둔다. 디자인 판단이 바뀌면 `docs/DESIGN.md` 를 고치고 여기는 건드리지 않는다. 원본과 결정을 섞으면 나중에 "이 색이 원래 그랬는지 우리가 바꾼 건지"를 알 수 없게 된다.

파일명만 두 개 바꿨다 — 번들 최상위 `README.md` → `HANDOFF_README.md`(이 문서와 이름이 겹쳐서), `uploads/PRD.md` → `uploads/PRD.snapshot.md`(아래 참고). 숨김 파일이던 `.thumbnail` 은 `thumbnail.webp` 로 폈다.

- **`prototype/HANDOFF_README.md` 의 지시를 그대로 따르지 말 것.** 번들이 코딩 에이전트에게 "프로토타입을 픽셀 단위로 재현하라"고 적어둔 원본 문서인데, 위 표의 결정들이 그 뒤에 내려졌다
- `_ds/` 디자인 시스템은 **다른 제품용**이다. 스스로 "financial-insight platform for finance teams" 용이라고 밝히고 있고 다크 토큰이 없다. 간격·radius·그림자·색 팔레트만 가져왔고 타이포 스케일은 버렸다(마케팅용이라 hero 80px다)

## 파일

| 경로 | 무엇 |
|---|---|
| `FinSight 프로토타입.dc.html` | 화면 9종. 상단이 마크업, 하단 `<script type="text/x-dc">` 가 목업 데이터와 로직 |
| `support.js` · `_ds/<시스템>/_ds_bundle.js` | 프로토타입 런타임. HTML을 브라우저에서 열려면 필요하다. **구현에는 쓰지 않는다** |
| `_ds/<시스템>/tokens/*.css` | 색·타이포·간격·radius·elevation 토큰 |
| `_ds/<시스템>/readme.md` | 디자인 시스템 자체 설명. "Known gaps" 절에 없는 것이 적혀 있다 |

`<시스템>` 은 `finsight-design-system-1f7cfde5-d4d8-415e-8576-6cd642df2233` 이다. 번들이 붙인 이름이라 그대로 뒀다.
| `thumbnail.webp` | 대시보드 라이트 모드 렌더 이미지 |
| `HANDOFF_README.md` | 번들 원본 README (위 주의 참고) |
| `uploads/PRD.snapshot.md` | **이 디자인을 만들 때 넣은 PRD.** 정본이 아니다 — 아래 참고 |

### `uploads/PRD.snapshot.md` 는 스냅샷이다

번들이 도착한 시점(2026-08-17)의 `docs/PRD.md` 와 **바이트 단위로 동일**했다(`git show bfa083c:docs/PRD.md`). 그 뒤 `docs/PRD.md` 에 신호 절대액 조건과 AI 리뷰 화면 서술이 추가되어 지금은 네 곳이 다르다.

**최신 PRD 는 언제나 `docs/PRD.md` 다.** 이 파일은 지우지도 갱신하지도 않는다 — 프로토타입이 무엇을 보고 만들어졌는지 기록하는 것이 목적이라, `docs/` 를 따라 고치면 그 목적이 사라진다. 프로토타입에 없는 화면·요소를 두고 "왜 안 그렸나"를 물을 때 답이 여기 있는 경우가 많다.

**번들 원본의 파일명은 `PRD.md` 였다.** 저장소에 `PRD.md` 가 둘이면 파일 검색과 grep 에서 어느 쪽이 스펙인지 갈리지 않아 `.snapshot` 을 붙였다. 내용은 한 글자도 바꾸지 않았다.

## 다크 팔레트 원본

`FinSight 프로토타입.dc.html` 의 `<style>` 안 `[data-theme="dark"]` 블록에 다크 값 35개가 있다. `_ds/` 에는 다크 토큰이 없으므로 **이 블록이 다크 모드의 유일한 원본**이다. `docs/DESIGN.md` 가 옮겨 적었지만, 원본을 확인할 일이 있으면 여기다.
