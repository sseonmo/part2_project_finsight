// dev-browser 스크립트 앞에 붙여 쓰는 공용 헬퍼.
//
// QuickJS 샌드박스라 import 가 없다. 그래서 파일로 두고 실행할 때 이어 붙인다:
//
//   { cat scripts/browser-test/prelude.js; cat <<'EOF'
//     const page = await auth();
//     await upload(page, "base-2026-06.csv", "카드 1");
//     console.log(await dash(page));
//   EOF
//   } | dev-browser --browser finsight
//
// 픽스처와 session-cookies.json 은 ~/.dev-browser/tmp/ 에 있어야 한다.
// scripts/browser-test/up.sh 가 거기로 복사한다.

const BASE = "http://localhost:3000";

/** 세션 쿠키를 심은 페이지를 돌려준다. 쿠키는 20~30분이면 끊기므로 스크립트마다 다시 심는다. */
async function auth(pageName = "main") {
  const page = await browser.getPage(pageName);
  const cookies = JSON.parse(await readFile("session-cookies.json")).map((c) => ({
    name: c.name,
    value: c.value,
    domain: "localhost",
    path: "/",
  }));
  await page.context().addCookies(cookies);

  return page;
}

/**
 * networkidle 을 쓰지 않는다 — pending 에 갇힌 job 이 하나라도 있으면
 * 진행률 카드가 계속 폴링해 영영 오지 않는다(KNOWN_ISSUES ⓒ).
 */
async function go(page, path, settleMs = 2500) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settleMs);
}

async function textOf(page, path, settleMs = 2500) {
  await go(page, path, settleMs);

  return await page.evaluate(() => document.body.innerText);
}

const dash = (page, settleMs) => textOf(page, "/dashboard", settleMs);

/** 업로드 다이얼로그를 열고 카드까지 고른다. */
async function openDialog(page, cardLabel) {
  await go(page, "/dashboard");
  await page.click("text=명세서 올리기");
  await page.waitForTimeout(800);

  if (cardLabel) {
    await setCard(page, cardLabel);
  }
}

/**
 * 카드 필드는 두 모드로 그려진다.
 *  - 이미 올린 카드가 있으면 `<select id="card-label">`
 *  - 하나도 없으면(첫 업로드) `<input type="text">` — **id 가 없다**
 * 그래서 id 로만 찾으면 첫 업로드에서 조용히 빗나가고, 지정한 이름 대신
 * 기본값 "카드 1" 로 올라간다. 클래스 폴백이 그 구멍을 막는다.
 */
async function setCard(page, label) {
  const state = await page.evaluate((label) => {
    const el =
      document.querySelector("#card-label") ||
      document.querySelector(".upload-dialog__input[type=text]");

    if (!el) return "missing-field";

    if (el.tagName === "SELECT") {
      if ([...el.options].some((o) => o.value === label)) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value",
        ).set;
        setter.call(el, label);
        el.dispatchEvent(new Event("change", { bubbles: true }));

        return "selected";
      }

      return "not-in-list";
    }

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, label);
    el.dispatchEvent(new Event("input", { bubbles: true }));

    return "typed";
  }, label);

  if (state === "not-in-list") {
    await page.click("text=새 카드 추가");
    await page.waitForTimeout(300);
    await setCard(page, label);

    return "added";
  }

  await page.waitForTimeout(200);

  return state;
}

/**
 * 파일 input 에 File 을 직접 주입한다. QuickJS 에는 fs 가 없어
 * setInputFiles(경로) 가 죽으므로 이 방법만 통한다.
 */
async function attach(page, fileName, content, mime = "text/csv") {
  return await page.evaluate(
    ({ content, fileName, mime }) => {
      const input = document.querySelector(".upload-dialog__input[type=file]");

      if (!input) return "no-input";

      const file = new File([content], fileName, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      return "attached";
    },
    { content, fileName, mime },
  );
}

/** base64 로 저장한 비 UTF-8 파일(EUC-KR 등)을 바이트 그대로 넣는다. */
async function attachBase64(page, fileName, base64, mime = "text/csv") {
  return await page.evaluate(
    ({ base64, fileName, mime }) => {
      const input = document.querySelector(".upload-dialog__input[type=file]");

      if (!input) return "no-input";

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const file = new File([bytes], fileName, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      return "attached";
    },
    { base64, fileName, mime },
  );
}

async function submit(page, settleMs = 4000) {
  await page.click(".upload-dialog__actions button[type=submit]");
  await page.waitForTimeout(settleMs);
}

/** 다이얼로그 열기 → 픽스처 붙이기 → 제출까지 한 번에. */
async function upload(page, fixture, cardLabel = "카드 1", settleMs = 6000) {
  await openDialog(page, cardLabel);
  const attached = await attach(page, fixture, await readFile(fixture));

  if (attached !== "attached") {
    throw new Error(`파일 input 을 찾지 못했다: ${attached}`);
  }

  await submit(page, settleMs);

  return await page.evaluate(() => document.body.innerText);
}

/** 다이얼로그가 파일을 거부했는지 본다(S16). 제출하지 않는다. */
async function attachOnly(page, fixture, cardLabel = "카드 1", mime = "text/csv") {
  await openDialog(page, cardLabel);
  await attach(page, fixture, await readFile(fixture), mime);
  await page.waitForTimeout(500);

  return await page.evaluate(() => {
    const dlg = document.querySelector(".upload-dialog");

    return dlg ? dlg.innerText : document.body.innerText;
  });
}

const shot = (page, name) => page.screenshot().then((b) => saveScreenshot(b, name));
