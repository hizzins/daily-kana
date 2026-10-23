// 화면에서 쓰는 순수 로직: 문제 표기, 채점 목표, 틀린 단위 설명, 정답률, 오답 노트.
import type { AppEntry } from "./data";
import type { Card, Mode } from "./db";
import { type ReadingResult, type ReadingTarget, type UnitResult, gradingReading } from "./grade/reading";

/** 문제로 보일 글자. 가나 모드는 읽기(가나), 한자 모드는 표제어. */
export const shownWord = (e: AppEntry, mode: Mode) => (mode === "kanji" ? e.word : e.reading);

/** 이 문제를 어떻게 보여줬는지(채점 규칙이 달라진다): 한자 모드라도 표제어가 가나면 가나로 보인다. */
export const shownAs = (e: AppEntry, mode: Mode): "kana" | "kanji" => (mode === "kanji" && e.kanji ? "kanji" : "kana");

/**
 * 발음 채점 목표. 가나로 보였으면 보인 가나 하나(pron 이 있으면 pron 으로 채점, 표에는 원문),
 * 한자로 보였으면 대표 읽기 + 다른 읽기(D4). 앞뒤 ～ 는 떼고 채점한다.
 */
export function readingTargets(e: AppEntry, mode: Mode): ReadingTarget[] {
  const shown = gradingReading(e.reading);
  const first: ReadingTarget = { kana: e.pron ? gradingReading(e.pron) : shown, shown };
  if (shownAs(e, mode) === "kana") return [first];
  return [first, ...e.other_readings.map((r) => ({ kana: gradingReading(r) }))];
}

const position = (i: number, total: number) => (total === 1 ? "" : i === 0 ? "첫 " : i === total - 1 ? "마지막 " : `${i + 1}번째 `);
const label = (u: UnitResult) => `${u.kana}(${u.expected || "생략"})`;

/** 틀린 단위마다 한 줄 설명. 헷갈림 카드가 붙은 단위는 모양 비교를, 나머지는 소리를 짚는다. */
export function explainUnits(r: ReadingResult): string[] {
  if (r.correct) return [];
  const lines: string[] = [];
  r.units.forEach((u, i) => {
    if (u.ok) return;
    const where = position(i, r.units.length);
    const card = r.confusions.find((c) => c.expected.kana === u.kana && c.got.hangul === u.got);
    if (card) lines.push(`${where}${label(u)}를 ${card.got.kana}(${card.got.hangul})로 읽었어. 두 글자는 모양이 비슷하지만 획이 달라.`);
    else if (!u.got) lines.push(`${where}${label(u)}를 빠뜨렸어.`);
    else if (u.kind === "n") lines.push(`${where}ん은 앞 글자 받침(ㄴ·ㅇ·ㅁ)이나 "응"으로 써.`);
    else if (u.kind === "sokuon") lines.push(`${where}っ는 앞 글자 받침 ㅅ으로 써.`);
    else lines.push(`${where}${label(u)}를 "${u.got}"로 썼어.`);
  });
  if (r.units.length === 0 || lines.length === 0) lines.push("입력한 글자가 정답보다 많아.");
  return lines;
}

/** 한 번의 답 점수: 발음·뜻 모두 ✓ = 1, 발음 ✓·뜻 △ = 0.5, 그 밖 0. */
export const attemptScore = (a: Card["history"][number]) =>
  !a.reading ? 0 : a.meaning === "correct" ? 1 : a.meaning === "partial" ? 0.5 : 0;

/** 최근 7일 정답률(△ = 0.5). 기록이 없으면 null. */
export function weeklyAccuracy(cards: Card[], now: Date = new Date()): { count: number; rate: number } | null {
  const since = now.getTime() - 7 * 24 * 3600 * 1000;
  const attempts = cards.flatMap((c) => c.history).filter((a) => Date.parse(a.at) >= since);
  if (!attempts.length) return null;
  return { count: attempts.length, rate: attempts.reduce((s, a) => s + attemptScore(a), 0) / attempts.length };
}

/** 오답 노트: 마지막 답이 완전히 맞지 않은 카드, 최근에 틀린 순. */
export function mistakes(cards: Card[]): Card[] {
  const last = (c: Card) => c.history[c.history.length - 1];
  return cards
    .filter((c) => c.history.length && attemptScore(last(c)) < 1)
    .sort((a, b) => (last(a).at < last(b).at ? 1 : -1));
}
