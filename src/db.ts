// 복습 기록 저장(IndexedDB)과 라이트너 상자 규칙.
// 규칙은 순수 함수로 두어 IndexedDB 없이 테스트하고, 저장은 얇은 래퍼만 둔다.
// 서버가 없으므로 기록은 이 기기 브라우저에만 있다 — 백업은 내보내기/가져오기(JSON).

import type { MeaningVerdict } from "./grade/meaning";

export type Level = "n5" | "n4" | "n3" | "n2" | "n1";
export type Mode = "kana" | "kanji";

// TalkBuddy 단어장과 같은 간격. 상자 0 = 새 단어, 맞힐 때마다 한 칸 위로 → 복습 간격이 길어진다.
export const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15];
export const MAX_BOX = INTERVAL_DAYS.length - 1; // 이 상자에 닿으면 "익힘"
export const HISTORY_LIMIT = 10;
export const DEFAULT_NEW_PER_DAY = 20; // 레벨×모드별

export interface Attempt {
  at: string; // ISO 시각
  reading: boolean;
  meaning: MeaningVerdict;
}

export interface Card {
  key: string; // `${id}:${mode}` — 가나 모드와 한자 모드는 다른 기술이라 상자를 따로 둔다(D8)
  id: string;
  level: Level;
  mode: Mode;
  box: number;
  due: string; // YYYY-MM-DD(기기 로컬 날짜)
  added: string; // 처음 푼 날 — 하루 새 카드 수를 셀 때 쓴다
  history: Attempt[]; // 최근 HISTORY_LIMIT 회
}

/** 가나 단위별 누적 정답/오답 — 후속 약점 지도(설계 Open Question 5)의 입력. 키는 원문 글자(문자 체계 보존). */
export interface UnitStat {
  unit: string;
  ok: number;
  ng: number;
}

export interface AnswerInput {
  id: string;
  level: Level;
  mode: Mode;
  reading: boolean; // 발음 채점 결과
  meaning: MeaningVerdict; // 뜻 채점 결과(✓/△/✗)
  units?: { kana: string; ok: boolean }[]; // 발음 단위 결과, 가나 모드만 집계한다
}

// ---------- 날짜 ----------

export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

// ---------- 상자 규칙 ----------

export const cardKey = (id: string, mode: Mode) => `${id}:${mode}`;

/**
 * 답 하나를 반영한 다음 카드. 발음 ✓·뜻 ✓ → 한 칸 위, 발음 ✗ 또는 뜻 ✗ → 1번 상자(오늘 다시),
 * 발음 ✓·뜻 △ → 상자 그대로·내일 다시(D13).
 */
export function nextCard(prev: Card | undefined, input: AnswerInput, now: Date = new Date()): Card {
  const today = localDay(now);
  const base: Card = prev ?? {
    key: cardKey(input.id, input.mode), id: input.id, level: input.level, mode: input.mode,
    box: 0, due: today, added: today, history: [],
  };
  let box = base.box;
  let due: string;
  if (!input.reading || input.meaning === "wrong") {
    box = 1;
    due = today;
  } else if (input.meaning === "partial") {
    due = addDays(today, 1);
  } else {
    box = Math.min(base.box + 1, MAX_BOX);
    due = addDays(today, INTERVAL_DAYS[box]);
  }
  const history = [...base.history, { at: now.toISOString(), reading: input.reading, meaning: input.meaning }].slice(
    -HISTORY_LIMIT,
  );
  return { ...base, level: input.level, box, due, history };
}

export const isMastered = (c: Card) => c.box === MAX_BOX;

/**
 * 오늘 풀 목록. 복습할 카드(due ≤ 오늘)를 먼저 — 기한이 오래된 것, 상자가 낮은 것부터 —,
 * 그다음 아직 안 푼 단어를 후보 순서대로, 오늘 이미 시작한 새 카드 수를 빼고 newPerDay 까지.
 */
export function buildSession(
  candidateIds: string[],
  cards: Map<string, Card>, // id → 이 레벨·모드의 카드
  today: string,
  newPerDay: number = DEFAULT_NEW_PER_DAY,
): { review: string[]; fresh: string[] } {
  const known = candidateIds.filter((id) => cards.has(id)).map((id) => cards.get(id)!);
  const review = known
    .filter((c) => c.due <= today)
    .sort((a, b) => (a.due === b.due ? a.box - b.box : a.due < b.due ? -1 : 1))
    .map((c) => c.id);
  const startedToday = known.filter((c) => c.added === today).length;
  const room = Math.max(0, newPerDay - startedToday);
  const fresh = candidateIds.filter((id) => !cards.has(id)).slice(0, room);
  return { review, fresh };
}

// ---------- 내보내기·가져오기 ----------

export const EXPORT_VERSION = 1;

export interface ExportData {
  app: "daily-kana";
  version: number;
  exportedAt: string;
  cards: Card[];
  units: UnitStat[];
}

export class ImportError extends Error {}

/** 가져올 JSON 을 검사한다. 형식이 다르면 아무것도 바꾸지 않도록 쓰기 전에 실패한다. */
export function parseExport(text: string): ExportData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("JSON 형식이 아닙니다");
  }
  const d = data as Partial<ExportData>;
  if (d?.app !== "daily-kana") throw new ImportError("daily-kana 내보내기 파일이 아닙니다");
  if (d.version !== EXPORT_VERSION) throw new ImportError(`지원하지 않는 버전: ${String(d.version)}`);
  if (!Array.isArray(d.cards) || !Array.isArray(d.units)) throw new ImportError("cards·units 가 없습니다");
  for (const c of d.cards)
    if (
      typeof c?.key !== "string" || typeof c.id !== "string" || (c.mode !== "kana" && c.mode !== "kanji") ||
      typeof c.box !== "number" || typeof c.due !== "string" || !Array.isArray(c.history)
    )
      throw new ImportError("카드 형식이 올바르지 않습니다");
  return d as ExportData;
}

// ---------- IndexedDB ----------

export class StorageError extends Error {
  constructor(message: string, public quota: boolean) {
    super(message);
  }
}

/** IndexedDB 오류를 사용자에게 보일 오류로. 용량 초과는 따로 구분한다(화면에서 내보내기를 권함). */
export function toStorageError(e: unknown): StorageError {
  const name = (e as { name?: string })?.name;
  if (name === "QuotaExceededError") return new StorageError("저장 공간이 부족해 기록하지 못했어요", true);
  return new StorageError(`기록을 저장하지 못했어요 (${name ?? String(e)})`, false);
}

const DB_VERSION = 1;
const CARDS = "cards";
const UNITS = "units";
const BY_LEVEL_MODE_DUE = "byLevelModeDue";

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export class ReviewDb {
  private constructor(private db: IDBDatabase) {}

  static open(name = "daily-kana", factory: IDBFactory = indexedDB): Promise<ReviewDb> {
    return new Promise((resolve, reject) => {
      const r = factory.open(name, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        const cards = db.createObjectStore(CARDS, { keyPath: "key" });
        cards.createIndex(BY_LEVEL_MODE_DUE, ["level", "mode", "due"]);
        db.createObjectStore(UNITS, { keyPath: "unit" });
      };
      r.onsuccess = () => resolve(new ReviewDb(r.result));
      r.onerror = () => reject(toStorageError(r.error));
    });
  }

  close() {
    this.db.close();
  }

  /** 이 레벨·모드의 카드 전부(id → 카드). 세션 만들기와 진도 계산에 쓴다. */
  async cards(level: Level, mode: Mode): Promise<Map<string, Card>> {
    const tx = this.db.transaction(CARDS, "readonly");
    const range = IDBKeyRange.bound([level, mode, ""], [level, mode, "￿"]);
    const list = await req(tx.objectStore(CARDS).index(BY_LEVEL_MODE_DUE).getAll(range) as IDBRequest<Card[]>);
    return new Map(list.map((c) => [c.id, c]));
  }

  /** 오늘 복습할 카드 수(레벨 선택 화면). 인덱스 범위로 세어 전체를 읽지 않는다. */
  dueCount(level: Level, mode: Mode, today: string): Promise<number> {
    const tx = this.db.transaction(CARDS, "readonly");
    const range = IDBKeyRange.bound([level, mode, ""], [level, mode, today]);
    return req(tx.objectStore(CARDS).index(BY_LEVEL_MODE_DUE).count(range));
  }

  /** 답 하나를 카드와 가나 단위 누적에 한 트랜잭션으로 기록한다. 실패하면 StorageError. */
  async record(input: AnswerInput, now: Date = new Date()): Promise<Card> {
    try {
      const tx = this.db.transaction([CARDS, UNITS], "readwrite");
      const cards = tx.objectStore(CARDS);
      const units = tx.objectStore(UNITS);
      const prev = (await req(cards.get(cardKey(input.id, input.mode)))) as Card | undefined;
      const card = nextCard(prev, input, now);
      cards.put(card);
      if (input.mode === "kana")
        for (const u of input.units ?? []) {
          const s = ((await req(units.get(u.kana))) as UnitStat | undefined) ?? { unit: u.kana, ok: 0, ng: 0 };
          units.put(u.ok ? { ...s, ok: s.ok + 1 } : { ...s, ng: s.ng + 1 });
        }
      await done(tx);
      return card;
    } catch (e) {
      throw e instanceof StorageError ? e : toStorageError(e);
    }
  }

  async unitStats(): Promise<UnitStat[]> {
    return req(this.db.transaction(UNITS, "readonly").objectStore(UNITS).getAll() as IDBRequest<UnitStat[]>);
  }

  async export(now: Date = new Date()): Promise<ExportData> {
    const tx = this.db.transaction([CARDS, UNITS], "readonly");
    const [cards, units] = await Promise.all([
      req(tx.objectStore(CARDS).getAll() as IDBRequest<Card[]>),
      req(tx.objectStore(UNITS).getAll() as IDBRequest<UnitStat[]>),
    ]);
    return { app: "daily-kana", version: EXPORT_VERSION, exportedAt: now.toISOString(), cards, units };
  }

  /** 가져오기는 확인 후 전체 대체한다(병합하지 않음). 한 트랜잭션이라 중간에 실패하면 이전 기록이 그대로 남는다. */
  async replaceAll(data: ExportData): Promise<void> {
    try {
      const tx = this.db.transaction([CARDS, UNITS], "readwrite");
      const cards = tx.objectStore(CARDS);
      const units = tx.objectStore(UNITS);
      cards.clear();
      units.clear();
      for (const c of data.cards) cards.put(c);
      for (const u of data.units) units.put(u);
      await done(tx);
    } catch (e) {
      throw toStorageError(e);
    }
  }
}
