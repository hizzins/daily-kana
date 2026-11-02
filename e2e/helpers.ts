import { readFileSync } from "node:fs";
import { type Page, expect } from "@playwright/test";
import type { AppEntry } from "../scripts/data";
import { gradeReading } from "../src/grade/reading";
import { readingTargets } from "../src/quiz-logic";

const n5: AppEntry[] = JSON.parse(readFileSync(new URL("../public/data/n5.json", import.meta.url), "utf8"));

/** 가나로 보인 N5 단어의 정답(한글 발음·대표 뜻). 같은 읽기 단어가 여럿이어도 가나 문제는 동음이의어 뜻도 정답이다. */
export function answerFor(shown: string) {
  const e = n5.find((x) => x.reading === shown);
  if (!e) throw new Error(`N5 에 없는 읽기: ${shown}`);
  return { reading: gradeReading(readingTargets(e, "kana"), "", "kana").expected, meaning: e.ko_primary };
}

/** 영구 저장 결과를 고정한다(헤드리스 Chrome 기본값에 기대지 않게). */
export async function stubPersist(page: Page, granted: boolean) {
  await page.addInitScript((g) => {
    const s = navigator.storage;
    Object.defineProperty(s, "persisted", { value: async () => g, configurable: true });
    Object.defineProperty(s, "persist", { value: async () => g, configurable: true });
  }, granted);
}

export const remaining = async (page: Page) =>
  Number((await page.getByText(/남은 문제 \d+/).textContent())!.match(/\d+/)![0]);

export async function openN5(page: Page) {
  await page.getByRole("button", { name: /^N5/ }).click();
  await expect(page.locator(".word")).toBeVisible();
}

/** 지금 문제를 맞게 풀고(발음 → Enter → 뜻 → Enter) 결과 제목을 돌려준다. */
export async function solve(page: Page) {
  const a = answerFor((await page.locator(".word").textContent())!);
  await page.getByLabel("한글 발음").fill(a.reading);
  await page.getByLabel("한글 발음").press("Enter");
  await page.getByLabel("한국어 뜻").fill(a.meaning);
  await page.getByLabel("한국어 뜻").press("Enter");
  return page.locator(".headline");
}

/** 기록이 IndexedDB 에 n 개 쌓일 때까지 기다린다(결과 화면이 뜬 뒤에 비동기로 저장되므로 바로 새로고침하면 놓칠 수 있다). */
export async function waitForCards(page: Page, n: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const r = indexedDB.open("daily-kana");
            r.onerror = () => reject(r.error);
            r.onsuccess = () => {
              const c = r.result.transaction("cards").objectStore("cards").count();
              c.onsuccess = () => (r.result.close(), resolve(c.result));
            };
          }),
      ),
    )
    .toBe(n);
}
