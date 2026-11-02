import { expect, test } from "@playwright/test";
import { openN5, solve, stubPersist, waitForCards } from "./helpers";

test.beforeEach(({ page }) => stubPersist(page, true));

test("오프라인 새로고침 후 같은 레벨을 이어서 푼다", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // 서비스 워커가 이 페이지를 맡게(첫 방문은 SW 없이 열림)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await openN5(page); // 이 레벨 데이터가 캐시에 들어간다
  await expect(await solve(page)).toContainText("정답이야!");
  await waitForCards(page, 1);

  await context.setOffline(true);
  await page.reload();
  await openN5(page);
  await expect(await solve(page)).toContainText("정답이야!");
  await waitForCards(page, 2);
  await page.getByRole("button", { name: "← 레벨" }).click();
  await page.getByRole("button", { name: "통계" }).click();
  await expect(page.getByRole("row", { name: /N5 단어/ })).toContainText("(시작 2)");

  // 한 번도 안 연 문장 데이터는 오프라인이면 안내만
  await page.getByRole("button", { name: "← 레벨" }).click();
  await page.getByRole("radio", { name: "문장" }).click();
  await expect(page.getByRole("button", { name: /^N5/ })).toContainText("오프라인이라 열 수 없어요");
  await context.setOffline(false);
});
