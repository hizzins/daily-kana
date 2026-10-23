import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type MeaningEntry, gradeMeaning, normalizeMeaning } from "./meaning";

const apple: MeaningEntry = { ko_primary: "사과", ko_accept: [] };
const kore: MeaningEntry = { ko_primary: "이것", ko_accept: ["이거"] };
const study: MeaningEntry = { ko_primary: "공부", ko_accept: ["공부하다"] };
const tv: MeaningEntry = { ko_primary: "텔레비전", ko_accept: ["TV", "티비"] };
const kamiPaper: MeaningEntry = {
  ko_primary: "종이",
  ko_accept: [],
  homophones: [
    { id: "hair", word: "髪", ko_primary: "머리카락", ko_accept: ["머리털"] },
    { id: "god", word: "神", ko_primary: "신", ko_accept: ["하느님"] },
  ],
};

describe("정규화 (D15)", () => {
  it.each([
    ["사과", "사과"],
    ["이것", "이것"],
    ["거짓말(하다)", "거짓말"],
    ["거짓말（하다）", "거짓말"],
    ["공부하다", "공부"],
    ["하다", "하다"],
    ["오늘 밤", "오늘밤"],
    [" TV ", "tv"],
    ["샤워를 하다", "샤워를"],
  ])("%s → %s", (input, out) => expect(normalizeMeaning(input)).toBe(out));
});

describe("조사를 떼지 않는다", () => {
  it("사과 ≠ 사", () => expect(gradeMeaning(apple, "사", "kana").verdict).toBe("wrong"));
  it("이것 ≠ 이", () => expect(gradeMeaning(kore, "이", "kana").verdict).toBe("wrong"));
  it("사과 = 사과", () => expect(gradeMeaning(apple, "사과", "kana").verdict).toBe("correct"));
});

describe("정답 목록과 정확히 일치", () => {
  it.each([
    [study, "공부", "correct"],
    [study, "공부하다", "correct"],
    [study, "공부 하다", "correct"],
    [study, "공부해요", "wrong"],
    [tv, "tv", "correct"],
    [tv, "Tv", "correct"],
    [tv, "티비", "correct"],
    [tv, "테레비", "wrong"],
    [apple, "", "wrong"],
    [apple, " , ", "wrong"],
  ] as const)("%o ← %s → %s", (entry, input, verdict) =>
    expect(gradeMeaning(entry, input, "kana").verdict).toBe(verdict),
  );
});

describe("여러 뜻 ✓/△/✗ (D10·D13)", () => {
  it("모두 목록에 있으면 ✓", () => {
    expect(gradeMeaning(tv, "텔레비전, TV", "kana").verdict).toBe("correct");
  });
  it("일부만 있으면 △, 없던 항목 표시", () => {
    const r = gradeMeaning(kamiPaper, "종이, 사과", "kana");
    expect(r.verdict).toBe("partial");
    expect(r.unmatched).toEqual(["사과"]);
    expect(r.items.map((i) => i.ok)).toEqual([true, false]);
  });
  it("하나도 없으면 ✗", () => {
    expect(gradeMeaning(kamiPaper, "사과, 포도", "kana").verdict).toBe("wrong");
  });
  it("쉼표 종류(， 、)도 나눈다", () => {
    expect(gradeMeaning(tv, "티비，TV、텔레비전", "kana").verdict).toBe("correct");
  });
  it("빈 항목은 무시한다", () => {
    expect(gradeMeaning(apple, "사과,,", "kana").verdict).toBe("correct");
  });
});

describe("동음이의어 — 가나로 보였을 때만", () => {
  it("가나 문제: 다른 단어 뜻도 정답", () => {
    const r = gradeMeaning(kamiPaper, "머리카락", "kana");
    expect(r.verdict).toBe("correct");
    expect(r.items[0].homophoneId).toBe("hair");
  });
  it("가나 문제: 자기 뜻 + 동음이의 뜻도 ✓", () => {
    expect(gradeMeaning(kamiPaper, "종이, 신", "kana").verdict).toBe("correct");
  });
  it("한자 문제: 다른 단어 뜻은 오답", () => {
    expect(gradeMeaning(kamiPaper, "머리카락", "kanji").verdict).toBe("wrong");
  });
  it("자기 뜻과 겹치는 동음이의 뜻은 자기 뜻으로 친다", () => {
    const e: MeaningEntry = { ...kamiPaper, homophones: [{ id: "x", word: "x", ko_primary: "종이", ko_accept: [] }] };
    expect(gradeMeaning(e, "종이", "kana").items[0].homophoneId).toBeUndefined();
  });
});

describe("N5 표본 50개 데이터", () => {
  const data: Record<string, { ko_primary: string; ko_accept: string[] }> = JSON.parse(
    readFileSync(new URL("../../data/ko/n5-sample50.json", import.meta.url), "utf8"),
  );
  const entries = Object.entries(data);
  it("50개", () => expect(entries).toHaveLength(50));
  it.each(entries)("%s: 대표 뜻과 인정 동의어가 전부 정답", (_, e) => {
    for (const m of [e.ko_primary, ...e.ko_accept]) expect(gradeMeaning(e, m, "kanji").verdict).toBe("correct");
  });
  it("항목 안에 / , 가 없다(검사 규칙)", () => {
    const bad = entries.flatMap(([, e]) => [e.ko_primary, ...e.ko_accept]).filter((m) => /[/,，、]/.test(m));
    expect(bad).toEqual([]);
  });
});
