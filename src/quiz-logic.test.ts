import { describe, expect, it } from "vitest";
import type { AppEntry } from "./data";
import type { Card } from "./db";
import { gradeReading } from "./grade/reading";
import { attemptScore, explainUnits, mistakes, readingTargets, shownAs, shownWord, weeklyAccuracy } from "./quiz-logic";

const entry = (over: Partial<AppEntry>): AppEntry => ({
  id: "x", word: "四", reading: "よん", other_readings: ["し"], kanji: true,
  ko_primary: "넷", ko_accept: [], homophones: [], ...over,
});

describe("문제 표기·채점 목표", () => {
  it("가나 모드는 읽기, 한자 모드는 표제어", () => {
    expect(shownWord(entry({}), "kana")).toBe("よん");
    expect(shownWord(entry({}), "kanji")).toBe("四");
  });
  it("한자 모드라도 가나 표제어면 가나로 보인 것", () => {
    expect(shownAs(entry({ kanji: false }), "kanji")).toBe("kana");
    expect(shownAs(entry({}), "kanji")).toBe("kanji");
  });
  it("가나로 보이면 목표 하나, 한자로 보이면 다른 읽기 포함(D4)", () => {
    expect(readingTargets(entry({}), "kana")).toEqual([{ kana: "よん", shown: "よん" }]);
    expect(readingTargets(entry({}), "kanji")).toEqual([{ kana: "よん", shown: "よん" }, { kana: "し" }]);
  });
  it("pron 이 있으면 pron 으로 채점하고 표에는 원문(D3)", () => {
    const e = entry({ word: "こんにちは", reading: "こんにちは", pron: "こんにちわ", kanji: false, other_readings: [] });
    expect(readingTargets(e, "kana")).toEqual([{ kana: "こんにちわ", shown: "こんにちは" }]);
  });
  it("앞뒤 ～ 는 떼고 채점", () => {
    const e = entry({ word: "～さん", reading: "～さん", kanji: false, other_readings: [] });
    expect(readingTargets(e, "kana")).toEqual([{ kana: "さん", shown: "さん" }]);
  });
});

describe("틀린 단위 설명", () => {
  const g = (k: string, input: string) => gradeReading([{ kana: k }], input, "kana");
  it("헷갈림 카드가 있으면 모양 비교", () => {
    expect(explainUnits(g("キクセツ", "키쿠세치"))).toEqual([
      "마지막 ツ(츠)를 チ(치)로 읽었어. 두 글자는 모양이 비슷하지만 획이 달라.",
    ]);
  });
  it("빠뜨린 글자", () => expect(explainUnits(g("ほん", "호"))).toEqual(["마지막 ん(ㄴ)를 빠뜨렸어."]));
  it("っ·ん 규칙 안내", () => {
    expect(explainUnits(g("がっこう", "각코"))[0]).toContain("っ는 앞 글자 받침 ㅅ");
  });
  it("그 밖의 소리 오류", () => expect(explainUnits(g("か", "가"))).toEqual(['か(카)를 "가"로 썼어.']));
  it("맞으면 설명 없음", () => expect(explainUnits(g("か", "카"))).toEqual([]));
  it("단위는 다 맞았는데 글자가 남으면", () => {
    expect(explainUnits(g("くつ", "쿠츠스")).length).toBeGreaterThan(0);
  });
});

const card = (history: Card["history"], over: Partial<Card> = {}): Card => ({
  key: "a:kana", id: "a", level: "n5", mode: "kana", box: 1, due: "2026-10-23", added: "2026-10-01", history, ...over,
});
const a = (at: string, reading: boolean, meaning: "correct" | "partial" | "wrong") => ({ at, reading, meaning });

describe("정답률·오답 노트", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("점수: ✓✓=1, ✓△=0.5, 나머지 0", () => {
    expect(attemptScore(a("", true, "correct"))).toBe(1);
    expect(attemptScore(a("", true, "partial"))).toBe(0.5);
    expect(attemptScore(a("", false, "correct"))).toBe(0);
    expect(attemptScore(a("", true, "wrong"))).toBe(0);
  });
  it("최근 7일만 센다", () => {
    const cards = [card([a("2026-10-01T00:00:00Z", true, "correct"), a("2026-10-22T00:00:00Z", true, "partial"), a("2026-10-23T00:00:00Z", true, "correct")])];
    expect(weeklyAccuracy(cards, now)).toEqual({ count: 2, rate: 0.75 });
    expect(weeklyAccuracy([], now)).toBeNull();
  });
  it("오답 노트는 마지막 답이 완전히 맞지 않은 카드, 최근 순", () => {
    const c1 = card([a("2026-10-20T00:00:00Z", true, "wrong")], { id: "c1" });
    const c2 = card([a("2026-10-22T00:00:00Z", true, "partial")], { id: "c2" });
    const c3 = card([a("2026-10-21T00:00:00Z", false, "correct"), a("2026-10-22T00:00:00Z", true, "correct")], { id: "c3" });
    expect(mistakes([c1, c2, c3]).map((c) => c.id)).toEqual(["c2", "c1"]);
  });
});
