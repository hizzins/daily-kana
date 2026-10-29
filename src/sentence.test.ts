import { describe, expect, it } from "vitest";
import { gradeReading } from "./grade/reading";
import { type SentenceEntry, chunkUnits, gradingSentence, sentenceKana, sentenceShownAs, sentenceTargets, shownSentence, spacedExpected } from "./sentence";

const e: SentenceEntry = {
  id: "s-1", ja: "私は学生です。", kana: "わたしは がくせいです。", pron: "わたしわ がくせいです。",
  ko: "저는 학생입니다.", kanji: true, words: [],
};
const grade = (input: string, mode: "kana" | "kanji" = "kana") =>
  gradeReading(sentenceTargets(e), input, sentenceShownAs(e, mode));

describe("문장 채점", () => {
  it("공백·문장부호는 채점 글자에서 빠지고 경계로만 남는다", () => {
    expect(sentenceKana("きのう、 いきました。")).toBe("きのういきました");
    expect(gradingSentence("きのう、いきました。")).toBe("きのう いきました");
  });
  it("어절 첫 모음은 앞 어절 끝과 장음으로 잇지 않는다", () => {
    const s: SentenceEntry = { ...e, kana: "あしたは あめが ふる", pron: "あしたわ あめが ふる" };
    const r = gradeReading(sentenceTargets(s), "", "kana");
    expect(r.expected).toBe("아시타와아메가후루");
    expect(gradeReading(sentenceTargets(s), "아시타와 메가 후루", "kana").correct).toBe(false);
  });
  it("조사 は 는 와 로 읽어야 맞다, 띄어쓰기는 자유", () => {
    expect(grade("와타시와 가쿠세-데스").correct).toBe(true);
    expect(grade("와타시와가쿠세이데스").correct).toBe(true);
    expect(grade("와타시하 가쿠세-데스").correct).toBe(false);
  });
  it("표에는 원문 は 를 보인다", () => expect(grade("와타시와 가쿠세-데스").units[3].kana).toBe("は"));
  it("보기 모드: 한자가 있으면 한자 문장, 없으면 가나", () => {
    expect(shownSentence(e, "kanji")).toBe("私は学生です。");
    expect(shownSentence(e, "kana")).toBe("わたしは がくせいです。");
    expect(shownSentence({ ...e, kanji: false }, "kanji")).toBe(e.kana);
  });
});

describe("chunkUnits", () => {
  it("단위를 어절로 다시 묶고 띄어 쓴 정답을 만든다", () => {
    const r = grade("와타시와 가쿠세-데스");
    const chunks = chunkUnits(e.kana, r.units);
    expect(chunks.map((c) => c.text)).toEqual(["わたしは", "がくせいです。"]);
    expect(chunks.map((c) => c.units.map((u) => u.kana).join(""))).toEqual(["わたしは", "がくせいです"]);
    expect(spacedExpected(chunks).split(" ")).toHaveLength(2);
    expect(spacedExpected(chunks).startsWith("와타시와 ")).toBe(true);
  });
  it("요음처럼 두 글자 단위도 어절 경계를 넘지 않는다", () => {
    const s: SentenceEntry = { ...e, kana: "でんしゃの なかで", pron: "でんしゃの なかで" };
    const r = gradeReading(sentenceTargets(s), "덴샤노 나카데", "kana");
    expect(chunkUnits(s.kana, r.units).map((c) => c.units.length)).toEqual([4, 3]);
  });
});
