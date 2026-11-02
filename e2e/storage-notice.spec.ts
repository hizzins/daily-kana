import { expect, test } from "@playwright/test";
import { openN5, solve, stubPersist, waitForCards } from "./helpers";

const NOTICE = "이 브라우저는 기록을 오래 보관한다고 약속하지 않았어요";

test("영구 저장이 거절되면 홈에 한 번 안내하고, 닫으면 다시 안 뜬다", async ({ page }) => {
  await stubPersist(page, false);
  await page.goto("./");
  await expect(page.getByText(NOTICE)).toBeVisible();
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText(NOTICE)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^N5/ })).toBeVisible();
  await expect(page.getByText(NOTICE)).toHaveCount(0);
});

test("영구 저장이 허락되면 안내도 백업 배너도 없다", async ({ page }) => {
  await stubPersist(page, true);
  await page.goto("./");
  await expect(page.getByRole("button", { name: /^N5/ })).toBeVisible();
  await expect(page.locator(".banner")).toHaveCount(0);
});

test("거절된 기기에서 기록이 있고 7일이 지나면 통계에 백업 배너, 내보내면 사라진다", async ({ page }) => {
  await stubPersist(page, false);
  await page.goto("./");
  await page.getByRole("button", { name: "확인" }).click();
  await openN5(page);
  await expect(await solve(page)).toBeVisible();
  await waitForCards(page, 1);
  await page.evaluate(() =>
    localStorage.setItem("dk.firstSeen", JSON.stringify(new Date(Date.now() - 8 * 86_400_000).toISOString())),
  );
  await page.getByRole("button", { name: "← 레벨" }).click();
  await page.getByRole("button", { name: "통계" }).click();
  await expect(page.getByText("아직 기록을 백업한 적이 없어요.", { exact: false })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "지금 내보내기" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^daily-kana-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator(".banner")).toHaveCount(0);
});

test.describe("아이폰 Safari", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });

  test("허락 여부와 상관없이 공부 전에 설치 안내, 기록이 있으면 옮기는 순서", async ({ page }) => {
    await stubPersist(page, true);
    await page.goto("./");
    await expect(page.getByText("아이폰은 홈 화면에 추가해서 쓰세요")).toBeVisible();
    await page.getByRole("button", { name: "Safari에서 계속하기" }).click();
    await openN5(page);
    await expect(await solve(page)).toBeVisible();
    await waitForCards(page, 1);
    await page.evaluate(() => localStorage.removeItem("dk.storageNoticeDismissed"));
    await page.goto("./");
    await expect(page.getByText("Safari에 쌓인 기록을 홈 화면 앱으로 옮기세요")).toBeVisible();
    await page.getByRole("button", { name: "통계로 가기" }).click();
    await expect(page.getByRole("heading", { name: "통계" })).toBeVisible();
  });
});
