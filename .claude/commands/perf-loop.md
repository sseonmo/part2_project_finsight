Lighthouse 성능 최적화 루프를 한 회차 실행한다 — 기준선 재측정 + 라운드마다 후보 3개 → 최고 1개만 keep.

인수: `$ARGUMENTS`

설계는 `docs/superpowers/specs/2026-10-11-lighthouse-loop-design.md`, 사람용 절차는 `scripts/lighthouse/program.md`.
이 커맨드는 **사전 점검 → 기준 화면 확인 → 워크플로 호출 → 결과 정리**만 한다. 측정·판정·git 은 전부
벤치의 `round.mjs` 와 워크플로가 결정론적으로 한다 — 결과를 해석해 바꾸지 마라.

```bash
BENCH=~/.cache/finsight-lighthouse/bench
```

---

## 1. 인수

- 숫자 하나 — 라운드 수. 없으면 2. 그 밖의 토큰은 무시한다
- **회차(run) 번호는 받지도 묻지도 않는다.** `round.mjs baseline` 이 `results.tsv` 의 마지막 run + 1 로 정한다

## 2. 사전 점검

하나라도 실패하면 그 자리에서 멈추고 이유와 해결 명령을 보여준다. 고칠 수 있는 것만 직접 고친다.

1. **벤치 상태** — `git -C $BENCH rev-parse --abbrev-ref HEAD` 가 `perf/lighthouse-loop`, `git -C $BENCH status --porcelain` 이 비어 있어야 한다.
   벤치가 없으면 `program.md` "최초 1회 — 벤치 준비" 를 안내하고 멈춘다
2. **main 과 맞추기** — `git -C $BENCH rev-list --count perf/lighthouse-loop..main` 이 0 보다 크면 `git -C $BENCH merge --ff-only main`.
   fast-forward 가 안 되면(루프 브랜치에 main 에 없는 keep 커밋이 있다) 멈추고 사용자에게 묻는다 — 루프 브랜치를 임의로 rebase·reset 하지 않는다.
   main 에 `package.json` 변경이 들어왔으면 `(cd $BENCH && npm ci)`
3. **로컬 Supabase** — `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/rest/v1/` 가 000 이면 `npx supabase start`.
   `npx supabase db reset`·`scripts/browser-test/reset.sh` 는 절대 돌리지 않는다(매핑 fixture 가 사라진다)
4. **포트 3100** — `lsof -tiTCP:3100 -sTCP:LISTEN` 에 출력이 있으면 멈춘다. 무엇이 쓰는지(`ps -p <pid>`) 보여주고 사용자에게 맡긴다. 임의로 kill 하지 않는다
5. **시각** — `TZ=Asia/Seoul date +%H%M` 이 2230 이상이면 "1회 실행은 약 1시간이라 자정을 넘기면 환경 오류로 멈춘다" 고 알리고 진행 여부를 묻는다

## 3. 기준 화면 확인

관문의 기준 이미지가 될 화면을 미리 찍어 사람에게 보여준다. 기준이 틀리면 그 실행의 판정 전체가 틀어진다.

```bash
cd $BENCH && npm run build > .local/lighthouse/preview-build.log 2>&1 \
  && node scripts/lighthouse/shots.mjs ref .local/lighthouse/shots/preview
```

Bash timeout 은 600000 으로 준다. 실패하면 로그 끝을 보여주고 멈춘다.

`Read` 로 `$BENCH/.local/lighthouse/shots/preview/mobile__root.png` 와 `desktop_dashboard.png` 를 열어 보여주고 묻는다:
"이 화면이 이번 실행의 기준이 됩니다(22장 중 2장). 진행할까요?" — 답을 받기 전에 워크플로를 띄우지 않는다.
CSS 가 빠졌거나 로그인 화면이 찍혔으면 묻지 말고 그 사실을 알리고 멈춘다.

## 4. 워크플로 실행

```
Workflow({
  scriptPath: '<$BENCH 의 절대 경로>/.claude/workflows/lighthouse-loop.js',
  args: { bench: '<$BENCH 의 절대 경로>', rounds: <1 의 라운드 수> },
})
```

- `name` 으로 부르지 않는다 — 메인 체크아웃의 사본보다 루프 브랜치의 스크립트가 앞서 있을 수 있다
- `args.run` 을 넣지 않는다
- 실행 중에는 `/workflows` 로 진행을 볼 수 있다고 한 줄 알린다. 완료 알림이 올 때까지 결과를 추측하지 않는다

## 5. 결과 정리

워크플로가 돌려준 요약(`run`·`aborted`·`stop`·`bestPerf`·`rounds`)과 `$BENCH/scripts/lighthouse/results.tsv` 의 이번 run 줄로 정리한다.

- `aborted` 가 있으면 그 문구를 그대로 맨 앞에 보여준다. 로그는 `$BENCH/.local/lighthouse/run<N>-*.json.log`
- 이번 run 번호, 기준선 점수 → 최종 `bestPerf`, 종료 사유(`stop.reason`: target·stall·max-rounds·no-hypotheses)
- 라운드별 후보 표: 후보 · 진단(auditId) · 결과(keep/outcompeted/discard/visual/crash/scope) · 점수 · 사유
- `visual` 이 있으면 `$BENCH/.local/lighthouse/shots/run<N>/r<R>-<후보>/diff/` 경로(다른 픽셀이 빨갛게 칠해진 이미지)
- keep 커밋이 있으면 `git -C $BENCH log --oneline main..perf/lighthouse-loop` 를 보여주고 끝에 한 줄:
  "keep 커밋은 루프 브랜치에만 있습니다. main 에 반영하려면 따로 말씀해 주세요." — 이 커맨드는 병합·push 하지 않는다
