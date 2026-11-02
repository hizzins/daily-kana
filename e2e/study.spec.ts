import { expect, test } from "@playwright/test";
import { openN5, remaining, solve, stubPersist, waitForCards } from "./helpers";

test.beforeEach(({ page }) => stubPersist(page, true));

test("학습 한 바퀴 — 레벨 선택 → 제출 → 채점 → 다음 → 진도 갱신", async ({ page }) => {
  await page.goto("./");
  await openN5(page);
  const before = await remaining(page);

  // 1번: 맞게
  await expect(await solve(page)).toContainText("정답이야!");
  await page.getByRole("button", { name: /다음/ }).click();
  expect(await remaining(page)).toBe(before - 1);

  // 2번: 발음을 틀리게 → 오답, 글자별 표와 정답이 보이고 오늘 다시 나오도록 큐 뒤에 붙는다
  await page.getByLabel("한글 발음").fill("아");
  await page.getByLabel("한글 발음").press("Enter");
  await page.getByLabel("한국어 뜻").fill("모름");
  await page.getByLabel("한국어 뜻").press("Enter");
  await expect(page.locator(".headline")).toContainText("오답");
  await expect(page.getByText(/^정답: /).first()).toBeVisible(); // 발음 정답(뜻 정답도 같은 형식)
  await expect(page.locator("table.units")).toBeVisible();
  await page.getByRole("button", { name: /다음/ }).click();
  expect(await remaining(page)).toBe(before - 1); // 하나 풀고 하나 다시 붙음

  await waitForCards(page, 2);
  // 진도: 통계의 "시작" 2개, 홈의 오늘 복습 1개(틀린 것)
  await page.getByRole("button", { name: "← 레벨" }).click();
  await expect(page.getByRole("button", { name: /^N5/ })).toContainText("오늘 복습 1");
  await page.getByRole("button", { name: "통계" }).click();
  await expect(page.getByRole("row", { name: /N5 단어/ })).toContainText("(시작 2)");
  await expect(page.getByText("N5 · 가나")).toBeVisible(); // 오답 노트
});
