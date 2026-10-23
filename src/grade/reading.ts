// 발음 채점: 가나 읽기를 음절 단위로 쪼개고, 한글 입력을 자모로 풀어 단위와 정렬한다.
// 자모는 NFD 의 조합형(초성 U+1100, 중성 U+1161, 종성 U+11A8)을 쓴다 — 초성 ㄴ과 받침 ㄴ이 다른 코드라
// ん·っ 를 받침으로 쓴 입력(칸, 갓)을 앞 음절과 따로 맞출 수 있다.
import {
  CONFUSABLE_PAIRS, HANGUL, N_ALONE, N_FINALS, SOKUON_FINALS, STROKE_NOTES,
  isKatakana, isSmallKana, toHiragana, toKatakana,
} from "./kana-table";

export type Script = "hira" | "kata";
export type UnitKind = "mora" | "n" | "sokuon" | "long";

export interface Unit {
  text: string; // 화면에 보일 원래 글자(pron 단어는 원문 は 그대로)
  key: string; // 규칙표 키(히라가나, pron 반영)
  script: Script;
  kind: UnitKind;
  expected: string; // 대표 표기("" = 생략)
  accepted: string[]; // 인정 표기 전부(표시용, "" = 생략 가능)
  options: string[][]; // 인정 표기의 자모 토큰
}

export class UnknownKanaError extends Error {
  constructor(public kana: string, public at: number) {
    super(`규칙표에 없는 가나: "${kana}" (${at}번째 글자)`);
  }
}

const COMPAT_INITIAL = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const COMPAT_MEDIAL = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const COMPAT_FINAL = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
const finalToken = (compat: string) => String.fromCharCode(0x11a8 + COMPAT_FINAL.indexOf(compat));
const isMedial = (t: string | undefined) => !!t && t >= "ᅡ" && t <= "ᅵ";

const syllableTokens = (s: string) => Array.from(s.normalize("NFD"));

// 장음 판정과 반복 표기("코오히")에 쓰는 모음 갈래. 대표 표기의 중성으로 정한다.
type Vowel = "a" | "i" | "u" | "e" | "o";
const MEDIAL_VOWEL: Vowel[] = [
  "a", "e", "a", "e", "o", "e", "o", "e", "o", "a", "e", "e", "o", "u", "o", "e", "i", "u", "u", "i", "i",
];
const REPEAT: Record<Vowel, string> = { a: "아", i: "이", u: "우", e: "에", o: "오" };
const PLAIN_VOWEL: Record<string, Vowel> = { あ: "a", い: "i", う: "u", え: "e", お: "o" };

function vowelOf(syllable: string): Vowel {
  const code = syllable.charCodeAt(0) - 0xac00;
  return MEDIAL_VOWEL[Math.floor((code % (21 * 28)) / 28)];
}

// 앞 음절 모음과 이어지는 장음인가: 같은 모음, お·う 단 뒤의 う, え단 뒤의 い.
const isLongAfter = (prev: Vowel, v: Vowel) =>
  prev === v || (v === "u" && prev === "o") || (v === "i" && prev === "e");

function moraUnit(text: string, key: string, at: number): Unit {
  const hangul = HANGUL[key];
  if (!hangul) throw new UnknownKanaError(text, at);
  return {
    text, key, kind: "mora", script: isKatakana(text[0]) ? "kata" : "hira",
    expected: hangul[0], accepted: hangul, options: hangul.map(syllableTokens),
  };
}

function longUnit(text: string, key: string, prev: Vowel | null, literal: string | null): Unit {
  const shown = prev ? [...new Set(["", ...(literal ? [literal] : []), REPEAT[prev], "-"])] : ["-"];
  return {
    text, key, kind: "long", script: isKatakana(text) ? "kata" : "hira",
    expected: shown[0], accepted: shown, options: shown.map((s) => (s === "-" ? ["-"] : syllableTokens(s))),
  };
}

/**
 * 가나 읽기를 채점 단위로 쪼갠다. 요음·외래어 작은 모음 조합은 한 단위, っ·ん·장음은 각자 한 단위.
 * shown 은 화면에 보일 원문(같은 길이). pron 예외 단어(こんにちわ)를 원문(こんにちは)으로 보여줄 때 쓴다.
 * 규칙표로 나눌 수 없는 글자가 있으면 UnknownKanaError — data.ts 의 읽기 완전 분할 검사가 이걸 쓴다.
 */
export function splitKana(kana: string, shown: string = kana): Unit[] {
  const chars = Array.from(kana);
  const shownChars = Array.from(shown);
  if (shownChars.length !== chars.length) throw new Error(`shown 길이가 다름: ${kana} / ${shown}`);
  const units: Unit[] = [];
  const lastMora = () => {
    const u = units[units.length - 1];
    return u?.kind === "mora" ? u : undefined;
  };

  chars.forEach((c, i) => {
    const h = toHiragana(c);
    const text = shownChars[i];
    if (isSmallKana(h)) {
      const prev = lastMora();
      if (!prev) throw new UnknownKanaError(text, i);
      units[units.length - 1] = moraUnit(prev.text + text, prev.key + h, i);
    } else if (h === "っ") {
      units.push({
        text, key: h, kind: "sokuon", script: isKatakana(text) ? "kata" : "hira",
        expected: SOKUON_FINALS[0], accepted: SOKUON_FINALS, options: SOKUON_FINALS.map((f) => [finalToken(f)]),
      });
    } else if (h === "ん") {
      const accepted = [...N_FINALS, N_ALONE];
      units.push({
        text, key: h, kind: "n", script: isKatakana(text) ? "kata" : "hira", expected: N_FINALS[0], accepted,
        options: [...N_FINALS.map((f) => [finalToken(f)]), syllableTokens(N_ALONE)],
      });
    } else if (h === "ー") {
      const prev = lastMora();
      units.push(longUnit(text, h, prev ? vowelOf(prev.expected) : null, null));
    } else if (PLAIN_VOWEL[h] && lastMora() && isLongAfter(vowelOf(lastMora()!.expected), PLAIN_VOWEL[h])) {
      units.push(longUnit(text, h, vowelOf(lastMora()!.expected), HANGUL[h][0]));
    } else {
      units.push(moraUnit(text, h, i));
    }
  });
  return units;
}

/** 채점에 쓰는 읽기. 접두·접미 표시 ～ 는 떼고 채점한다(화면은 원문 그대로). 앱과 data.ts 가 같이 쓴다. */
export const gradingReading = (r: string) => r.replace(/^[～〜]+|[～〜]+$/g, "");

/** 입력 한글을 자모 토큰으로. 공백은 지우고 장음 기호(ー ~ 〜 - －)는 "-" 하나로 맞춘다. */
export function tokenize(input: string): string[] {
  const s = input.normalize("NFC").replace(/\s+/g, "").replace(/[ー~〜－‐\-]/g, "-");
  return Array.from(s.normalize("NFD"));
}

/** 자모 토큰을 화면용 글자로. 음절을 못 이루는 낱자는 호환 자모(ㄴ, ㅏ)로 보여준다. */
export function tokensToText(tokens: string[]): string {
  return Array.from(tokens.join("").normalize("NFC"))
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 0x1100 && code <= 0x1112) return COMPAT_INITIAL[code - 0x1100];
      if (code >= 0x1161 && code <= 0x1175) return COMPAT_MEDIAL[code - 0x1161];
      if (code >= 0x11a8 && code <= 0x11c2) return COMPAT_FINAL[code - 0x11a8];
      return c;
    })
    .join("");
}

interface Step { score: number; penalty: number; prev: number; ok: boolean; len: number }
const MAX_WRONG_TOKENS = 4;

/**
 * 단위와 입력 토큰을 동적 계획법으로 정렬한다. 맞은 단위 수를 최대로, 같으면 틀린 단위가
 * 대표 표기 길이만큼(한 음절씩) 먹도록 고른다. 입력은 끝까지 다 써야 하며 남는 글자는 마지막 단위가 가진다.
 */
function align(units: Unit[], tokens: string[]) {
  const n = units.length;
  const m = tokens.length;
  const best: (Step | null)[][] = Array.from({ length: n + 1 }, () => Array<Step | null>(m + 1).fill(null));
  best[0][0] = { score: 0, penalty: 0, prev: -1, ok: false, len: 0 };
  const better = (a: Step | null, score: number, penalty: number) =>
    !a || score > a.score || (score === a.score && penalty < a.penalty);

  for (let i = 0; i < n; i++) {
    const u = units[i];
    const primaryLen = u.options[0].length;
    for (let j = 0; j <= m; j++) {
      const cur = best[i][j];
      if (!cur) continue;
      for (const o of u.options) {
        if (j + o.length > m || !o.every((t, k) => tokens[j + k] === t)) continue;
        const k = j + o.length;
        if (better(best[i + 1][k], cur.score + 1, cur.penalty))
          best[i + 1][k] = { score: cur.score + 1, penalty: cur.penalty, prev: j, ok: true, len: o.length };
      }
      const maxLen = i === n - 1 ? m - j : Math.min(MAX_WRONG_TOKENS, m - j);
      for (let len = 0; len <= maxLen; len++) {
        const penalty = cur.penalty + Math.abs(len - primaryLen) + 1;
        if (better(best[i + 1][j + len], cur.score, penalty))
          best[i + 1][j + len] = { score: cur.score, penalty, prev: j, ok: false, len };
      }
    }
  }

  const path: { ok: boolean; got: string[] }[] = [];
  let j = m;
  for (let i = n; i > 0; i--) {
    const s = best[i][j]!;
    path.unshift({ ok: s.ok, got: tokens.slice(s.prev, s.prev + s.len) });
    j = s.prev;
  }
  return path;
}

export interface UnitResult {
  kana: string;
  script: Script;
  kind: UnitKind;
  expected: string;
  accepted: string[];
  got: string;
  ok: boolean;
}

export interface ConfusionCard {
  expected: { kana: string; hangul: string; note: string };
  got: { kana: string; hangul: string; note: string };
}

export interface ReadingResult {
  correct: boolean;
  targetIndex: number; // 한자로 보인 문제에서 여러 읽기 중 어느 것으로 채점했는지
  units: UnitResult[];
  correctCount: number;
  total: number;
  expected: string; // 대표 표기로 이은 정답("키쿠세츠")
  confusions: ConfusionCard[];
}

export interface ReadingTarget {
  kana: string; // 채점 목표(pron 이 있으면 pron)
  shown?: string; // 화면에 보일 원문, 같은 길이
}

function expectedText(units: Unit[]): string {
  const tokens: string[] = [];
  for (const u of units) {
    if ((u.kind === "n" || u.kind === "sokuon") && !isMedial(tokens[tokens.length - 1])) {
      if (u.kind === "n") tokens.push(...syllableTokens(N_ALONE));
      continue;
    }
    tokens.push(...u.options[0]);
  }
  return tokensToText(tokens);
}

// 한글 한 음절 → 그렇게 읽히는 한 글자 가나(히라가나). 헷갈림 카드에서 "사용자가 무엇으로 읽었나"를 찾는다.
const REVERSE = new Map<string, string[]>();
for (const [key, hangul] of Object.entries(HANGUL)) {
  if (Array.from(key).length !== 1) continue;
  for (const h of hangul) REVERSE.set(h, [...(REVERSE.get(h) ?? []), key]);
}
REVERSE.set(N_ALONE, ["ん"]);

function confusionsFor(units: UnitResult[]): ConfusionCard[] {
  const cards: ConfusionCard[] = [];
  for (const u of units) {
    if (u.ok || u.kind !== "mora" || Array.from(u.kana).length !== 1) continue;
    const pairs = CONFUSABLE_PAIRS[u.script];
    for (const key of REVERSE.get(u.got) ?? []) {
      const got = u.script === "kata" ? toKatakana(key) : key;
      if (!pairs.some(([a, b]) => (a === u.kana && b === got) || (a === got && b === u.kana))) continue;
      if (cards.some((c) => c.expected.kana === u.kana && c.got.kana === got)) continue;
      cards.push({
        expected: { kana: u.kana, hangul: u.expected, note: STROKE_NOTES[u.kana] ?? "" },
        got: { kana: got, hangul: u.got, note: STROKE_NOTES[got] ?? "" },
      });
    }
  }
  return cards;
}

function gradeOne(target: ReadingTarget, tokens: string[], shownAs: "kana" | "kanji") {
  const units = splitKana(target.kana, target.shown ?? target.kana);
  const path = align(units, tokens);
  const results: UnitResult[] = units.map((u, i) => ({
    kana: u.text, script: u.script, kind: u.kind, expected: u.expected, accepted: u.accepted,
    got: tokensToText(path[i].got), ok: path[i].ok,
  }));
  const correctCount = results.filter((r) => r.ok).length;
  return {
    units: results,
    correctCount,
    total: results.length,
    correct: results.length > 0 && correctCount === results.length,
    expected: expectedText(units),
    // 한자로 보인 문제는 가나 모양을 본 게 아니라 헷갈림 카드를 끈다.
    confusions: shownAs === "kana" ? confusionsFor(results) : [],
  };
}

/**
 * 한글 발음 입력을 채점한다. targets 는 가나로 보인 문제면 보인 가나(또는 pron) 하나,
 * 한자로 보인 문제면 reading + other_readings. 가장 많이 맞은 읽기로 결과 표를 만든다.
 */
// gstack-shortcut(dec-ba7e8d52-2256-402e-abc3-8b01dc4426eb): 발음 정정 수단 없음 — 규칙표 오판은 코드 수정으로만 고쳐짐, upgrade when 실사용에서 같은 단어 발음 오판을 2회 이상 겪을 때(발음 정정 + 개인 인정 목록 재검토)
export function gradeReading(targets: ReadingTarget[], input: string, shownAs: "kana" | "kanji"): ReadingResult {
  if (targets.length === 0) throw new Error("채점 목표가 없음");
  const tokens = tokenize(input);
  let best: ReadingResult = { ...gradeOne(targets[0], tokens, shownAs), targetIndex: 0 };
  for (let i = 1; i < targets.length; i++) {
    const r = { ...gradeOne(targets[i], tokens, shownAs), targetIndex: i };
    if ((r.correct && !best.correct) || (r.correct === best.correct && r.correctCount > best.correctCount)) best = r;
  }
  return best;
}
