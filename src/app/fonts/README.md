# Pretendard

`PretendardVariable.subset.woff2` 는 Pretendard Variable 원본(2,057,688 bytes)을
KS X 1001 상용 한글 2,350자 + 라틴 + 숫자 + 문장부호로 subset 한 결과다
(465,424 bytes, 77% 감소). variable 축(`wght 45–930`)은 그대로 남아 있어
`src/app/layout.tsx` 의 `weight: "45 920"` 과 500·600 굵기가 모두 렌더된다.

subset 은 개발자 머신에서 한 번 하는 작업이고 결과물만 저장소에 들어간다.
**`package.json` 에 fonttools 를 넣지 말 것.** 다시 만들어야 하면 아래를 쓴다.

```bash
# pip install fonttools brotli
HANGUL=$(python3 - <<'EOP'
def ks(cp):
    try:
        chr(cp).encode("iso2022_kr")
    except UnicodeEncodeError:
        return False
    return True

print(",".join(f"U+{cp:04X}" for cp in range(0xAC00, 0xD7A4) if ks(cp)))
EOP
)
pyftsubset PretendardVariable.woff2 \
  --output-file=PretendardVariable.subset.woff2 \
  --flavor=woff2 --layout-features='*' \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+20AC,U+2190-2193,U+2212,U+25A0-25CF,U+3000-303F,U+3131-318E,U+FF01-FF5E,$HANGUL"
```

`$HANGUL` 은 `iso2022_kr` 로 인코딩되는 음절(= KS X 1001 2,350자) 목록이다. 여기에 없는 희귀 음절은 시스템 폰트로 폴백된다.
