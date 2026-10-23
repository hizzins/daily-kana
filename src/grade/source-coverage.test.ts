import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitKana } from "./reading";

// 원천 데이터의 읽기가 전부 규칙표로 나뉘는지(설계 §1 읽기 완전 분할 검사의 엔진 쪽 보증).
// 앞뒤 ～ 는 data.ts 가 떼고 채점하므로 여기서도 뗀다.
const n5: { word: string; reading: string }[] = JSON.parse(
  readFileSync(new URL("../../data/source/openjlpt-0.3.0/n5.json", import.meta.url), "utf8"),
);

describe("OpenJLPT N5 읽기 분할", () => {
  it("674개 전부 규칙표로 나뉜다", () => {
    const failed = n5
      .map((e) => e.reading.replace(/^[～〜]|[～〜]$/g, ""))
      .filter((r) => {
        try {
          splitKana(r);
          return false;
        } catch {
          return true;
        }
      });
    expect(n5).toHaveLength(674);
    expect(failed).toEqual([]);
  });
});
