# Pretendard

`PretendardLatin.woff2` 는 Pretendard Variable 원본(2,057,688 bytes)에서
굵기 축을 `wght 400–600` 으로 자르고 라틴·숫자·문장부호·기호만 남긴 결과다
(40,484 bytes). `src/app/layout.tsx` 의 `weight: "400 600"` 이 이 축과 맞물리고,
코드가 쓰는 굵기는 400·500·600 뿐이다.

**한글은 이 폰트에 없다.** `globals.css` 의 `--font-core` 다음 순위인 시스템 폰트
(macOS·iOS 는 Apple SD Gothic Neo, Windows 는 맑은 고딕)로 그려진다. 금액 숫자와 영문만
모든 기기에서 같은 모양으로 보이게 하는 것이 목적이다.

이유: 한글 2,350자를 담은 465KB 폰트가 Lighthouse 모바일 점수를 약 20점 깎았다
(3페이지 평균 — 한글 포함 80, 굵기만 자름 87.67, 이 파일 99, 폰트 없음 99.67).
점수는 표시 방식(`display`)이 아니라 파일 크기에 반응했다 — `optional` 로 바꿔도 79.67 이었다.

subset 은 개발자 머신에서 한 번 하는 작업이고 결과물만 저장소에 들어간다.
**`package.json` 에 fonttools 를 넣지 말 것.** 다시 만들어야 하면 아래를 쓴다.

```bash
# pip install fonttools brotli
curl -sSLO https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2
python3 -m fontTools.varLib.instancer PretendardVariable.woff2 wght=400:600 -o range.ttf -q
pyftsubset range.ttf \
  --output-file=PretendardLatin.woff2 \
  --flavor=woff2 --layout-features='*' \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+20AC,U+2190-2193,U+2212,U+25A0-25CF"
```

굵기 축을 넓히거나(예: 700 을 쓰기 시작할 때) 한글을 다시 넣으면 파일이 커지고 점수가 떨어진다.
바꾸기 전에 `scripts/lighthouse/` 로 측정할 것.
