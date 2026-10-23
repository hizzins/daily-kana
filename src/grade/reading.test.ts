import { describe, expect, it } from "vitest";
import { HANGUL } from "./kana-table";
import { UnknownKanaError, gradeReading, splitKana, tokenize, tokensToText } from "./reading";

const kana = (k: string, input: string) => gradeReading([{ kana: k }], input, "kana");

// [가나, 입력, 정답 여부, 맞은 단위 수(선택)]
const CASES: [string, string, boolean, number?][] = [
  // 기본·스크린샷
  ["ウソ", "우소", true],
  ["キクセツ", "키쿠세츠", true],
  ["キクセツ", "키쿠세쓰", true],
  ["キクセツ", "키쿠세치", false, 3],
  ["くつ", "쿠츠", true],
  ["くつ", "쿠 츠", true],
  ["くつ", "쿠츠스", false],
  ["くつ", "", false, 0],
  // 청·탁 엄격
  ["か", "카", true],
  ["か", "가", false],
  ["が", "가", true],
  ["が", "카", false],
  ["た", "다", false],
  ["だ", "다", true],
  ["さ", "자", false],
  ["ざ", "자", true],
  ["は", "바", false],
  ["ば", "바", true],
  ["ぱ", "파", true],
  ["ぱ", "바", false],
  ["かばん", "가방", false, 2],
  ["とうきょう", "도쿄", false],
  ["とうきょう", "토쿄", true],
  // ん 받침·단독
  ["かばん", "카방", true],
  ["かばん", "카반", true],
  ["かばん", "카밤", true],
  ["ほん", "혼", true],
  ["ほん", "홍", true],
  ["ほん", "호응", true],
  ["ほん", "호", false, 1],
  ["せんせい", "센세이", true],
  ["せんせい", "셍세", true],
  ["せんせい", "세응세이", true],
  ["げんいん", "겐인", true],
  ["げんいん", "게닌", false], // 연음 표기는 Open Question 3 — 지금은 불인정
  // っ 받침 ㅅ (Open Question 1: 뒤 자음 받침은 불인정)
  ["がっこう", "갓코", true],
  ["がっこう", "갓코우", true],
  ["がっこう", "갓코오", true],
  ["がっこう", "갓코-", true],
  ["がっこう", "각코", false],
  ["がっこう", "가코", false],
  ["きって", "킷테", true],
  ["ちょっと", "춋토", true],
  ["ちょっと", "촛토", true],
  // 장음
  ["コーヒー", "코히", true],
  ["コーヒー", "코오히이", true],
  ["コーヒー", "코-히-", true],
  ["コーヒー", "코~히~", true],
  ["コーヒー", "커피", false],
  ["きょう", "쿄", true],
  ["きょう", "쿄오", true],
  ["きょう", "쿄우", true],
  ["おおきい", "오키", true],
  ["おおきい", "오오키이", true],
  ["ちゅう", "츄우", true],
  ["ちゅう", "추", true],
  ["かう", "카우", true], // a 뒤 う 는 장음이 아님
  ["かう", "카", false],
  // 요음
  ["しゃしん", "샤신", true],
  ["じゃ", "자", true],
  ["じゃ", "쟈", true],
  ["ちゃ", "차", true],
  ["きゃく", "캬쿠", true],
  ["りょこう", "료코", true],
  ["びょういん", "뵤인", true],
  ["びょういん", "보인", false],
  // 외래어 조합
  ["パーティー", "파티", true],
  ["パーティー", "파-티-", true],
  ["ファン", "판", true],
  ["ファン", "환", true],
  ["フィルム", "피루무", true],
  ["ウィンドウ", "윈도우", true],
  ["ウェブ", "웨부", true],
  ["チェック", "쳇쿠", true],
  ["チェック", "첵쿠", false], // っ 는 받침 ㅅ 만(Open Question 1)
  ["シェフ", "셰후", true],
  ["シェフ", "쉐후", true],
  ["ジェット", "젯토", true],
  ["ディスク", "디스쿠", true],
  ["ヴァイオリン", "바이오린", true],
  ["テレビ", "테레비", true],
  ["テレビ", "텔레비", false],
  // 기타
  ["つくえ", "쓰쿠에", true],
  ["ふね", "후네", true],
  ["すし", "스시", true],
  ["すし", "수시", false],
  ["を", "오", true],
  ["を", "워", true],
];

describe("gradeReading — 표 기반", () => {
  it.each(CASES)("%s ← %s → %s", (k, input, correct, count) => {
    const r = kana(k, input);
    expect(r.correct).toBe(correct);
    if (count !== undefined) expect(r.correctCount).toBe(count);
  });
});

describe("규칙표 전 항목", () => {
  // 모든 인정 표기가 그 가나 하나만으로 정답이 되는지 — 표를 고칠 때 깨진 칸을 바로 잡는다.
  const entries = Object.entries(HANGUL).flatMap(([k, hs]) => hs.map((h) => [k, h] as const));
  it.each(entries)("%s = %s", (k, h) => {
    expect(kana(k, h).correct).toBe(true);
  });
  it("항목 수가 충분하다", () => expect(entries.length).toBeGreaterThan(120));
});

describe("결과 표", () => {
  it("단위 1개 = 1행, n/m 은 단위 수", () => {
    const r = kana("キクセツ", "키쿠세치");
    expect(r.units.map((u) => u.kana)).toEqual(["キ", "ク", "セ", "ツ"]);
    expect(r.units.map((u) => u.got)).toEqual(["키", "쿠", "세", "치"]);
    expect(r.units.map((u) => u.ok)).toEqual([true, true, true, false]);
    expect([r.correctCount, r.total]).toEqual([3, 4]);
    expect(r.expected).toBe("키쿠세츠");
  });
  it("요음·외래어 조합은 한 행", () => {
    expect(splitKana("しゃしん").map((u) => u.text)).toEqual(["しゃ", "し", "ん"]);
    expect(splitKana("パーティー").map((u) => [u.text, u.kind])).toEqual([
      ["パ", "mora"], ["ー", "long"], ["ティ", "mora"], ["ー", "long"],
    ]);
  });
  it("ん·っ 행의 '내 답'은 받침 낱자", () => {
    const r = kana("がっこう", "갓코");
    expect(r.units.map((u) => [u.kana, u.got])).toEqual([["が", "가"], ["っ", "ㅅ"], ["こ", "코"], ["う", ""]]);
    expect(r.expected).toBe("갓코");
  });
  it("ん 이 맨 앞이 아닌데 받침을 못 붙이면 대표 정답은 '응'", () => {
    expect(kana("ほん", "혼").expected).toBe("혼");
  });
  it("가타카나 원문 문자 체계를 보존한다", () => {
    expect(splitKana("ツつ").map((u) => u.script)).toEqual(["kata", "hira"]);
  });
});

describe("pron 예외 (D3)", () => {
  const konnichiwa = [{ kana: "こんにちわ", shown: "こんにちは" }];
  it("콘니치와 정답", () => expect(gradeReading(konnichiwa, "콘니치와", "kana").correct).toBe(true));
  it("콘니치하 오답", () => expect(gradeReading(konnichiwa, "콘니치하", "kana").correct).toBe(false));
  it("곤니치와 오답(こ=코)", () => expect(gradeReading(konnichiwa, "곤니치와", "kana").correct).toBe(false));
  it("표의 가나 칸은 원문 は", () => {
    const r = gradeReading(konnichiwa, "콘니치와", "kana");
    expect(r.units[r.units.length - 1]).toMatchObject({ kana: "は", expected: "와" });
  });
  it("pron 이 없으면 はな 를 와나로 쓰면 오답", () => expect(kana("はな", "와나").correct).toBe(false));
  it("shown 길이가 다르면 오류", () => expect(() => splitKana("こんにちわ", "こんにちは!")).toThrow());
});

describe("다른 읽기 (D4)", () => {
  const yon = [{ kana: "よん" }, { kana: "し" }];
  it("四 = 욘", () => expect(gradeReading(yon, "욘", "kanji")).toMatchObject({ correct: true, targetIndex: 0 }));
  it("四 = 시", () => expect(gradeReading(yon, "시", "kanji")).toMatchObject({ correct: true, targetIndex: 1 }));
  it("四 ≠ 요", () => expect(gradeReading(yon, "요", "kanji").correct).toBe(false));
  it("틀리면 가장 많이 맞은 읽기로 표를 그린다", () => {
    expect(gradeReading(yon, "욤", "kanji").targetIndex).toBe(0);
  });
});

describe("헷갈림 카드", () => {
  it("ツ 를 치로 → ツ/チ 카드", () => {
    const c = kana("キクセツ", "키쿠세치").confusions;
    expect(c).toHaveLength(1);
    expect(c[0].expected).toMatchObject({ kana: "ツ", hangul: "츠" });
    expect(c[0].got).toMatchObject({ kana: "チ", hangul: "치" });
    expect(c[0].expected.note).not.toBe("");
  });
  it("ツ 를 시로 → ツ/シ 카드", () => {
    expect(kana("ツ", "시").confusions[0].got.kana).toBe("シ");
  });
  it("히라가나 つ 를 시로 → 카드 없음(つ/し 는 닮지 않음)", () => {
    expect(kana("つ", "시").confusions).toEqual([]);
  });
  it("ソ 를 응으로 → ソ/ン 카드", () => {
    expect(kana("ソ", "응").confusions[0].got.kana).toBe("ン");
  });
  it("ぬ 를 메로 → ぬ/め 카드", () => {
    expect(kana("ぬ", "메").confusions[0].got.kana).toBe("め");
  });
  it("한자로 보인 문제는 카드 없음", () => {
    expect(gradeReading([{ kana: "ツ" }], "시", "kanji").confusions).toEqual([]);
  });
  it("닮지 않은 글자로 틀리면 카드 없음", () => {
    expect(kana("ツ", "카").confusions).toEqual([]);
  });
  it("맞으면 카드 없음", () => {
    expect(kana("ツ", "츠").confusions).toEqual([]);
  });
});

describe("분할 오류", () => {
  it("규칙표에 없는 글자는 UnknownKanaError", () => {
    expect(() => splitKana("ゐ")).toThrow(UnknownKanaError);
    expect(() => splitKana("～さん")).toThrow(UnknownKanaError);
  });
  it("앞 음절 없는 작은 글자는 오류", () => {
    expect(() => splitKana("ゃ")).toThrow(UnknownKanaError);
  });
  it("표에 없는 조합은 오류", () => {
    expect(() => splitKana("ぬぁ")).toThrow(UnknownKanaError);
  });
});

describe("입력 정규화", () => {
  it("공백 제거, 장음 기호 통일", () => {
    expect(tokensToText(tokenize(" 코 ~ 히 ー "))).toBe("코-히-");
  });
  it("음절을 못 이루는 낱자는 호환 자모로 보인다", () => {
    expect(tokensToText(["ᆫ"])).toBe("ㄴ");
  });
  it("빈 목표는 오류", () => {
    expect(() => gradeReading([], "카", "kana")).toThrow();
  });
});
