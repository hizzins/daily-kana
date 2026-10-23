import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  type AnswerInput, type Card, HISTORY_LIMIT, ImportError, MAX_BOX, ReviewDb, StorageError,
  addDays, buildSession, isMastered, localDay, nextCard, parseExport, toStorageError,
} from "./db";

const at = (day: string) => new Date(`${day}T09:00:00`);
const ans = (over: Partial<AnswerInput> = {}): AnswerInput => ({
  id: "w1", level: "n5", mode: "kana", reading: true, meaning: "correct", ...over,
});
const card = (over: Partial<Card>): Card => ({
  key: `${over.id ?? "w"}:kana`, id: "w", level: "n5", mode: "kana", box: 1, due: "2026-10-23",
  added: "2026-10-01", history: [], ...over,
});

describe("날짜", () => {
  it("localDay 는 기기 로컬 날짜", () => expect(localDay(new Date(2026, 9, 3, 23, 59))).toBe("2026-10-03"));
  it("addDays 는 월·연을 넘긴다", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-23", 0)).toBe("2026-10-23");
  });
});

describe("상자 규칙 (D13)", () => {
  const today = "2026-10-23";
  it("새 카드를 맞히면 1번 상자, 내일 복습", () => {
    const c = nextCard(undefined, ans(), at(today));
    expect(c).toMatchObject({ key: "w1:kana", box: 1, due: "2026-10-24", added: today });
  });
  it("발음·뜻 모두 맞으면 한 칸 위, 간격만큼 뒤로", () => {
    expect(nextCard(card({ box: 2 }), ans(), at(today))).toMatchObject({ box: 3, due: "2026-10-27" });
  });
  it("마지막 상자에서 더 오르지 않는다", () => {
    const c = nextCard(card({ box: MAX_BOX }), ans(), at(today));
    expect(c.box).toBe(MAX_BOX);
    expect(isMastered(c)).toBe(true);
  });
  it("발음이 틀리면 1번 상자, 오늘 다시", () => {
    expect(nextCard(card({ box: 4 }), ans({ reading: false }), at(today))).toMatchObject({ box: 1, due: today });
  });
  it("뜻이 ✗ 이면 1번 상자, 오늘 다시", () => {
    expect(nextCard(card({ box: 4 }), ans({ meaning: "wrong" }), at(today))).toMatchObject({ box: 1, due: today });
  });
  it("뜻이 △ 이면 상자 그대로, 내일 다시", () => {
    expect(nextCard(card({ box: 4 }), ans({ meaning: "partial" }), at(today))).toMatchObject({ box: 4, due: "2026-10-24" });
  });
  it("발음 ✗ + 뜻 △ 은 1번 상자", () => {
    expect(nextCard(card({ box: 4 }), ans({ reading: false, meaning: "partial" }), at(today)).box).toBe(1);
  });
  it("기록은 최근 HISTORY_LIMIT 회만", () => {
    let c: Card | undefined;
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) c = nextCard(c, ans({ reading: i % 2 === 0 }), at(today));
    expect(c!.history).toHaveLength(HISTORY_LIMIT);
    expect(c!.history[HISTORY_LIMIT - 1].reading).toBe((HISTORY_LIMIT + 2) % 2 === 0);
  });
  it("처음 푼 날(added)은 바뀌지 않는다", () => {
    expect(nextCard(card({ added: "2026-09-01" }), ans(), at(today)).added).toBe("2026-09-01");
  });
});

describe("오늘 풀 목록", () => {
  const today = "2026-10-23";
  const ids = ["a", "b", "c", "d", "e", "f"];
  it("복습 카드를 먼저(기한 오래된 것, 상자 낮은 것 순), 그다음 새 단어", () => {
    const cards = new Map<string, Card>([
      ["b", card({ id: "b", due: "2026-10-23", box: 3 })],
      ["c", card({ id: "c", due: "2026-10-20", box: 2 })],
      ["d", card({ id: "d", due: "2026-10-23", box: 1 })],
      ["e", card({ id: "e", due: "2026-10-30", box: 4 })],
    ]);
    expect(buildSession(ids, cards, today, 20)).toEqual({ review: ["c", "d", "b"], fresh: ["a", "f"] });
  });
  it("오늘 이미 시작한 새 카드만큼 새 단어를 줄인다", () => {
    const cards = new Map<string, Card>([
      ["a", card({ id: "a", added: today, due: "2026-10-24" })],
      ["b", card({ id: "b", added: today, due: "2026-10-24" })],
    ]);
    expect(buildSession(ids, cards, today, 3).fresh).toEqual(["c"]);
    expect(buildSession(ids, cards, today, 2).fresh).toEqual([]);
  });
  it("후보에 없는 카드(다른 모드·레벨)는 무시", () => {
    const cards = new Map<string, Card>([["zzz", card({ id: "zzz", due: "2026-10-01" })]]);
    expect(buildSession(ids, cards, today, 1)).toEqual({ review: [], fresh: ["a"] });
  });
});

describe("내보내기 파일 검사", () => {
  const ok = { app: "daily-kana", version: 1, exportedAt: "x", cards: [card({})], units: [] };
  it("올바른 파일", () => expect(parseExport(JSON.stringify(ok)).cards).toHaveLength(1));
  it.each([
    ["JSON 아님", "{"],
    ["다른 앱", JSON.stringify({ ...ok, app: "talkbuddy" })],
    ["버전 다름", JSON.stringify({ ...ok, version: 2 })],
    ["cards 없음", JSON.stringify({ ...ok, cards: undefined })],
    ["카드 형식", JSON.stringify({ ...ok, cards: [{ key: "x" }] })],
  ])("%s → ImportError", (_, text) => expect(() => parseExport(text)).toThrow(ImportError));
});

describe("저장 오류", () => {
  it("용량 초과는 quota 로 구분", () => {
    const e = toStorageError({ name: "QuotaExceededError" });
    expect(e).toBeInstanceOf(StorageError);
    expect(e.quota).toBe(true);
  });
  it("그 밖의 오류", () => expect(toStorageError(new Error("x")).quota).toBe(false));
});

describe("ReviewDb (fake-indexeddb)", () => {
  const open = () => ReviewDb.open("t", new IDBFactory());

  it("답을 기록하고 레벨·모드별로 읽는다", async () => {
    const db = await open();
    await db.record(ans({ id: "a" }), at("2026-10-23"));
    await db.record(ans({ id: "a", mode: "kanji" }), at("2026-10-23"));
    await db.record(ans({ id: "b", level: "n4" }), at("2026-10-23"));
    const kana = await db.cards("n5", "kana");
    expect([...kana.keys()]).toEqual(["a"]);
    expect(kana.get("a")).toMatchObject({ box: 1, due: "2026-10-24" });
    expect([...(await db.cards("n5", "kanji")).keys()]).toEqual(["a"]);
    db.close();
  });

  it("같은 카드를 다시 기록하면 이어서 오른다", async () => {
    const db = await open();
    await db.record(ans(), at("2026-10-23"));
    const c = await db.record(ans(), at("2026-10-24"));
    expect(c).toMatchObject({ box: 2, due: "2026-10-26", added: "2026-10-23" });
    expect(c.history).toHaveLength(2);
    db.close();
  });

  it("오늘 복습 수는 due ≤ 오늘", async () => {
    const db = await open();
    await db.record(ans({ id: "a", reading: false }), at("2026-10-23")); // 오늘 다시
    await db.record(ans({ id: "b" }), at("2026-10-23")); // 내일
    expect(await db.dueCount("n5", "kana", "2026-10-23")).toBe(1);
    expect(await db.dueCount("n5", "kana", "2026-10-24")).toBe(2);
    expect(await db.dueCount("n5", "kanji", "2026-10-24")).toBe(0);
    db.close();
  });

  it("가나 단위 누적은 가나 모드만, 원문 글자 단위로", async () => {
    const db = await open();
    const units = [{ kana: "ツ", ok: false }, { kana: "キ", ok: true }];
    await db.record(ans({ units }), at("2026-10-23"));
    await db.record(ans({ units: [{ kana: "ツ", ok: true }] }), at("2026-10-23"));
    await db.record(ans({ mode: "kanji", units: [{ kana: "ツ", ok: false }] }), at("2026-10-23"));
    const stats = Object.fromEntries((await db.unitStats()).map((s) => [s.unit, [s.ok, s.ng]]));
    expect(stats).toEqual({ ツ: [1, 1], キ: [1, 0] });
    db.close();
  });

  it("내보내기 → 다른 저장소로 가져오기(전체 대체) 왕복", async () => {
    const a = await open();
    await a.record(ans({ id: "x", units: [{ kana: "あ", ok: true }] }), at("2026-10-23"));
    const exported = parseExport(JSON.stringify(await a.export(at("2026-10-23"))));
    const b = await open();
    await b.record(ans({ id: "old" }), at("2026-10-01"));
    await b.replaceAll(exported);
    expect([...(await b.cards("n5", "kana")).keys()]).toEqual(["x"]);
    expect(await b.unitStats()).toEqual([{ unit: "あ", ok: 1, ng: 0 }]);
    a.close();
    b.close();
  });
});
