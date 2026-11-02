import { type Locator, expect, test } from "@playwright/test";
import { answerFor, openN5, remaining, stubPersist } from "./helpers";

// 한글 조합 중 Enter(isComposing / keyCode 229)는 무시해야 한다 — 칸을 두 번 넘기거나 마지막 음절이 빠진 채 제출되지 않게.
// Playwright 는 실제 IME 를 띄울 수 없어 조합 중 keydown 을 직접 보낸다. 실제 폰 키보드는 수동으로 한 번 확인한다.
const composingEnter = (el: Locator, how: "isComposing" | "229") =>
  el.evaluate((node, how) => {
    const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: how === "isComposing" });
    if (how === "229") Object.defineProperty(e, "keyCode", { get: () => 229 });
    node.dispatchEvent(e);
  }, how);

test.beforeEach(({ page }) => stubPersist(page, true));

for (const how of ["isComposing", "229"] as const) {
  test(`조합 중 Enter(${how})는 칸 이동·제출을 하지 않는다`, async ({ page }) => {
    await page.goto("./");
    await openN5(page);
    const before = await remaining(page);
    const a = answerFor((await page.locator(".word").textContent())!);
    const reading = page.getByLabel("한글 발음");
    const meaning = page.getByLabel("한국어 뜻");

    await reading.fill(a.reading);
    await composingEnter(reading, how);
    await expect(reading).toBeFocused(); // 뜻 칸으로 넘어가지 않음

    await reading.press("Enter"); // 조합이 끝난 뒤 Enter 한 번 = 한 칸 이동
    await expect(meaning).toBeFocused();

    await meaning.fill(a.meaning);
    await composingEnter(meaning, how);
    await expect(page.locator(".headline")).toHaveCount(0); // 제출 안 됨
    await expect(meaning).toHaveValue(a.meaning); // 마지막 음절까지 그대로

    await meaning.press("Enter");
    await expect(page.locator(".headline")).toContainText("정답이야!");
    await expect(page.getByText(`내 답: ${a.reading}`)).toBeVisible();

    await page.keyboard.press("Enter"); // 결과에서 Enter 한 번 = 다음 문제 하나
    await expect(page.getByLabel("한글 발음")).toBeFocused();
    expect(await remaining(page)).toBe(before - 1);
  });
}
