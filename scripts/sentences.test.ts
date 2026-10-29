import { describe, expect, it } from "vitest";
import { type RawSentence, type WordRef, buildSentences, derivePron, sentenceId } from "./sentences";

const vocab: WordRef[] = [
  { word: "私", reading: "わたくし", other_readings: ["わたし"], ko_primary: "저" },
  { word: "学生", reading: "がくせい", ko_primary: "학생" },
  { word: "はし", reading: "はし", ko_primary: "젓가락" },
  { word: "橋", reading: "はし", ko_primary: "다리" },
  { word: "行く", reading: "いく", ko_primary: "가다" },
];
const raw = (over: Partial<RawSentence> = {}): RawSentence => ({
  ja: "私は学生です。", kana: "わたしは がくせいです。", ko: "저는 학생입니다.", words: ["私", "学生"], ...over,
});

describe("derivePron", () => {
  it.each([
    ["わたしは がくせいです。", "わたしわ がくせいです。"],
    ["がっこうへ いきます。", "がっこうえ いきます。"],
    ["パンを たべます。", "パンお たべます。"],
    ["ははは げんきです。", "ははわ げんきです。"], // 어절 끝 は 만
    ["はなが さきます。", "はなが さきます。"],
    ["へやに います。", "へやに います。"],
    ["すきでは ありません。", "すきでわ ありません。"],
    ["こんにちは。", "こんにちわ。"],
    ["トイレは どこですか。", "トイレわ どこですか。"],
  ])("%s → %s", (kana, pron) => expect(derivePron(kana)).toBe(pron));
});

describe("buildSentences", () => {
  it("발음·한자 여부·문장 속 단어(문장에 나온 읽기)를 담는다", () => {
    const { out, problems } = buildSentences([raw()], vocab);
    expect(problems).toEqual([]);
    expect(out[0]).toEqual({
      id: sentenceId("私は学生です。"), ja: "私は学生です。", kana: "わたしは がくせいです。", pron: "わたしわ がくせいです。",
      ko: "저는 학생입니다.", kanji: true,
      words: [{ word: "私", reading: "わたし", ko: "저" }, { word: "学生", reading: "がくせい", ko: "학생" }],
    });
  });
  it("가나만 있는 문장은 한자 보기 대상이 아니다", () => {
    expect(buildSentences([raw({ ja: "はい。", kana: "はい。", words: [] })], vocab).out[0].kanji).toBe(false);
  });
  it("가나 표제어는 읽기로도 찾고, 겹치면 word:reading 으로 고른다", () => {
    const ok = buildSentences([raw({ words: ["はし:はし", "行く"] })], vocab);
    expect(ok.problems).toEqual([]);
    expect(ok.out[0].words.map((w) => w.ko)).toEqual(["젓가락", "가다"]);
  });
  it.each<[string, Partial<RawSentence>, string]>([
    ["레벨에 없는 단어", { words: ["猫"] }, "레벨 단어에 없음"],
    ["숫자", { ja: "3時です。" }, "숫자는 한자로"],
    ["가나 밖 글자", { kana: "わたしは 学生です。" }, "가나"],
    ["공백 두 칸", { kana: "わたしは  がくせいです。" }, "공백"],
    ["pron 길이", { pron: "わたしわ がくせいです" }, "길이"],
    ["pron 이 다른 글자를 바꿈", { pron: "わたしわ がくせえです。" }, "만 바꿀 수 있음"],
    ["빈 번역", { ko: " " }, "빈 칸"],
  ])("%s → 문제", (_, over, detail) => {
    const { problems } = buildSentences([raw(over)], vocab);
    expect(problems.map((p) => p.detail).join("\n")).toContain(detail);
  });
  it("같은 문장이 두 번", () => {
    expect(buildSentences([raw(), raw()], vocab).problems.map((p) => p.detail)).toEqual(["같은 문장이 또 있음"]);
  });
});
