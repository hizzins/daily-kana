import { describe, expect, it } from "vitest";
import { type KoEntry, type SourceEntry, buildLevels, contentKey, customId, gradingReading } from "./data";

const src = (id: string, word: string, reading: string, meaning = id, other_readings: string[] | null = null): SourceEntry => ({
  id, word, reading, meanings: [meaning], other_readings,
});
const ko = (ko_primary: string, ...ko_accept: string[]): KoEntry => ({ ko_primary, ko_accept });

describe("buildLevels", () => {
  it("한자 여부, 원문 읽기, 다른 읽기를 담는다", () => {
    const { out, problems } = buildLevels({
      sources: { n5: [src("a", "四", "よん", "four", ["し"]), src("b", "はし", "はし", "chopsticks")] },
      ko: { n5: { a: ko("넷", "사"), b: ko("젓가락") } },
      overrides: {},
    });
    expect(problems).toEqual([]);
    expect(out.n5).toMatchObject([
      { id: "a", word: "四", kanji: true, other_readings: ["し"], ko_primary: "넷" },
      { id: "b", word: "はし", kanji: false, ko_primary: "젓가락" },
    ]);
  });

  it("뜻 파일이 없는 레벨은 결과에 없다(준비 중)", () => {
    const { out } = buildLevels({
      sources: { n5: [src("a", "犬", "いぬ")], n4: [src("b", "猫", "ねこ")] },
      ko: { n5: { a: ko("개") } },
      overrides: {},
    });
    expect(Object.keys(out)).toEqual(["n5"]);
  });

  it("레벨 간 같은 내용은 낮은 레벨에만 남긴다", () => {
    const { out, dropped } = buildLevels({
      sources: { n5: [src("a", "犬", "いぬ", "dog")], n4: [src("b", "犬", "いぬ", "dog")] },
      ko: { n5: { a: ko("개") }, n4: { b: ko("개") } },
      overrides: {},
    });
    expect(out.n4).toEqual([]);
    expect(dropped).toEqual([{ level: "n4", id: "b", word: "犬", keptIn: "n5" }]);
  });

  it("같은 레벨 안 중복은 문제", () => {
    const { problems } = buildLevels({
      sources: { n5: [src("a", "犬", "いぬ", "dog"), src("b", "犬", "いぬ", "dog")] },
      ko: { n5: { a: ko("개"), b: ko("개") } },
      overrides: {},
    });
    expect(problems.map((p) => p.kind)).toEqual(["duplicate"]);
  });

  it("뜻 누락은 문제, --allow-partial 이면 그 단어만 뺀다", () => {
    const input = { sources: { n5: [src("a", "犬", "いぬ"), src("b", "猫", "ねこ")] }, ko: { n5: { a: ko("개") } }, overrides: {} };
    expect(buildLevels(input).problems.map((p) => [p.kind, p.id])).toEqual([["missing-ko", "b"]]);
    const partial = buildLevels({ ...input, allowPartial: true });
    expect(partial.problems).toEqual([]);
    expect(partial.out.n5!.map((e) => e.id)).toEqual(["a"]);
  });

  it("빈 대표 뜻, 허용되지 않는 문자(/ , 가나)는 문제", () => {
    const { problems } = buildLevels({
      sources: { n5: [src("a", "犬", "いぬ"), src("b", "猫", "ねこ"), src("c", "鳥", "とり"), src("d", "魚", "さかな")] },
      ko: { n5: { a: ko(" "), b: ko("고양이", "냥이/고양이"), c: ko("새", "새, 조류"), d: ko("물고기", "さかな") } },
      overrides: {},
    });
    expect(problems.map((p) => [p.kind, p.id])).toEqual([
      ["empty-primary", "a"], ["bad-char", "b"], ["bad-char", "c"], ["bad-char", "d"],
    ]);
  });

  it("영문·숫자·공백·하이픈·가운뎃점은 허용", () => {
    const { problems } = buildLevels({
      sources: { n5: [src("a", "テレビ", "テレビ")] },
      ko: { n5: { a: ko("텔레비전", "TV", "2채널 TV", "티-비", "텔레·비전") } },
      overrides: {},
    });
    expect(problems).toEqual([]);
  });

  it("규칙표로 나눌 수 없는 읽기는 문제, 앞뒤 ～ 는 떼고 검사", () => {
    const { problems } = buildLevels({
      sources: { n5: [src("a", "～さん", "～さん"), src("b", "ゐ", "ゐ")] },
      ko: { n5: { a: ko("씨"), b: ko("이") } },
      overrides: {},
    });
    expect(problems.map((p) => [p.kind, p.id])).toEqual([["unsplittable", "b"]]);
  });

  it("다른 읽기도 분할 검사한다", () => {
    const { problems } = buildLevels({
      sources: { n5: [src("a", "四", "よん", "four", ["ゐ"])] },
      ko: { n5: { a: ko("넷") } },
      overrides: {},
    });
    expect(problems.map((p) => p.kind)).toEqual(["unsplittable"]);
  });

  it("pron 은 같은 길이여야 하고 결과에 담긴다", () => {
    const sources = { n5: [src("a", "こんにちは", "こんにちは", "hello")] };
    const ok = buildLevels({ sources, ko: { n5: { a: ko("안녕하세요") } }, overrides: { a: { pron: "こんにちわ" } } });
    expect(ok.problems).toEqual([]);
    expect(ok.out.n5![0].pron).toBe("こんにちわ");
    expect(ok.pronCandidates).toEqual([]);
    const bad = buildLevels({ sources, ko: { n5: { a: ko("안녕하세요") } }, overrides: { a: { pron: "こんにちわあ" } } });
    expect(bad.problems.map((p) => p.kind)).toEqual(["pron-length"]);
  });

  it("は/へ 로 끝나는 읽기는 pron 후보로 알린다(뜻 유무와 상관없이)", () => {
    const { pronCandidates } = buildLevels({
      sources: { n4: [src("a", "または", "または"), src("b", "は", "は"), src("c", "猫", "ねこ")] },
      ko: {},
      overrides: {},
    });
    expect(pronCandidates.map((c) => c.id)).toEqual(["a"]);
  });

  it("수정 항목: 제외, 표기·뜻 덮어쓰기, 원천에 없는 id 는 문제", () => {
    const { out, problems } = buildLevels({
      sources: { n5: [src("a", "犬", "いぬ"), src("b", "猫", "ねこ")] },
      ko: { n5: { a: ko("개") } },
      overrides: { b: { exclude: true }, a: { word: "狗", ko_accept: ["멍멍이"] }, zzz: { exclude: true } },
    });
    expect(out.n5).toMatchObject([{ id: "a", word: "狗", ko_primary: "개", ko_accept: ["멍멍이"] }]);
    expect(problems.map((p) => [p.kind, p.id])).toEqual([["unknown-override", "zzz"]]);
  });

  it("동음이의어는 레벨을 넘어 상대의 표기·뜻을 복사한다(D6)", () => {
    const { out } = buildLevels({
      sources: { n5: [src("a", "はし", "はし", "chopsticks")], n4: [src("b", "橋", "はし", "bridge")] },
      ko: { n5: { a: ko("젓가락") }, n4: { b: ko("다리") } },
      overrides: {},
    });
    expect(out.n5![0].homophones).toEqual([{ id: "b", word: "橋", ko_primary: "다리", ko_accept: [] }]);
    expect(out.n4![0].homophones).toEqual([{ id: "a", word: "はし", ko_primary: "젓가락", ko_accept: [] }]);
  });

  it("수정 항목 level 로 다른 레벨 단어를 옮기면 원본 id 그대로 그 레벨에 들어간다", () => {
    const { out } = buildLevels({
      sources: { n5: [src("a", "犬", "いぬ")], n3: [src("b", "桜", "さくら")] },
      ko: { n5: { a: ko("개"), b: ko("벚꽃") } },
      overrides: { b: { level: "n5" } },
    });
    expect(out.n5!.map((e) => e.id)).toEqual(["a", "b"]);
    expect(out.n3).toBeUndefined();
  });

  it("옮겨 온 단어가 그 레벨의 같은 내용과 겹치면 중복으로 막는다", () => {
    const { problems } = buildLevels({
      sources: { n5: [src("a", "桜", "さくら", "cherry")], n3: [src("b", "桜", "さくら", "cherry")] },
      ko: { n5: { a: ko("벚꽃"), b: ko("벚꽃") } },
      overrides: { b: { level: "n5" } },
    });
    expect(problems.map((p) => p.kind)).toEqual(["duplicate"]);
  });

  it("수정 항목 other_readings 는 원천 다른 읽기에 더해지고 분할 검사도 받는다", () => {
    const ok = buildLevels({
      sources: { n5: [src("a", "私", "わたくし", "I")] },
      ko: { n5: { a: ko("저") } },
      overrides: { a: { other_readings: ["わたし"] } },
    });
    expect(ok.out.n5![0].other_readings).toEqual(["わたし"]);
    const bad = buildLevels({
      sources: { n5: [src("a", "私", "わたくし", "I")] },
      ko: { n5: { a: ko("저") } },
      overrides: { a: { other_readings: ["ゐ"] } },
    });
    expect(bad.problems.map((p) => p.kind)).toEqual(["unsplittable"]);
  });

  it("외부 중복 문제(koDuplicates)를 그대로 싣는다", () => {
    const { problems } = buildLevels({
      sources: {}, ko: {}, overrides: {},
      koDuplicates: [{ id: "x", kind: "duplicate-ko", detail: "n5-001.json 와 n5-002.json" }],
    });
    expect(problems.map((p) => p.kind)).toEqual(["duplicate-ko"]);
  });
});

describe("도움 함수", () => {
  it("gradingReading 은 앞뒤 ～ 만 뗀다", () => {
    expect(gradingReading("～さん")).toBe("さん");
    expect(gradingReading("お～")).toBe("お");
    expect(gradingReading("ねこ")).toBe("ねこ");
  });
  it("customId 는 OpenJLPT 와 같은 방식(SHA-1(word + U+0000 + reading) 앞 10자리)", () => {
    expect(customId("紙", "かみ")).toBe("cd08f9cdc2"); // OpenJLPT N5 紙 의 id
  });
  it("contentKey 는 표기·읽기·첫 영어 뜻", () => {
    expect(contentKey(src("a", "犬", "いぬ", "dog"))).toBe("犬|いぬ|dog");
  });
});
