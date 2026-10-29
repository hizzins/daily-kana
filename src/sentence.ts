// 문장 문제: 표기·채점 목표·어절 묶기. 앱과 scripts/sentences.ts 가 같이 쓴다.
import type { Mode } from "./db";
import type { ReadingTarget, UnitResult } from "./grade/reading";

export interface SentenceWord {
  word: string;
  reading: string;
  ko: string;
}

export interface SentenceEntry {
  id: string;
  ja: string; // 한자 보기 문장(듣기도 이 문장을 읽는다)
  kana: string; // 가나 보기 문장, 어절마다 공백
  pron: string; // kana 와 같은 길이의 실제 발음(を→お, 어절 끝 は→わ·へ→え)
  ko: string; // 번역(채점에 안 씀)
  kanji: boolean; // 한자 보기 출제 대상
  words: SentenceWord[];
}

const SKIP = /[\s。、？！?!]/g;

/** 공백·문장부호를 뺀 가나(어절 글자 수 세기용). */
export const sentenceKana = (s: string) => s.replace(SKIP, "");

/** 채점에 쓰는 가나: 문장부호도 어절 경계로 보고 경계마다 공백 하나(splitKana 가 경계 너머로 장음을 잇지 않게). */
export const gradingSentence = (s: string) => s.replace(SKIP, " ").replace(/ +/g, " ").trim();

export const sentenceShownAs = (e: SentenceEntry, mode: Mode): "kana" | "kanji" =>
  mode === "kanji" && e.kanji ? "kanji" : "kana";

export const shownSentence = (e: SentenceEntry, mode: Mode) => (sentenceShownAs(e, mode) === "kanji" ? e.ja : e.kana);

/** 발음 채점 목표. 읽기는 하나뿐이고, 표에는 원문 가나(は)를, 채점에는 발음(わ)을 쓴다. */
export const sentenceTargets = (e: SentenceEntry): ReadingTarget[] => [
  { kana: gradingSentence(e.pron), shown: gradingSentence(e.kana) },
];

/** 결과 화면용: 채점 단위를 kana 의 어절(공백 단위)로 다시 묶는다. 문장부호는 어절 글자에 남긴다. */
export function chunkUnits(kana: string, units: UnitResult[]): { text: string; units: UnitResult[] }[] {
  let i = 0;
  return kana
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => {
      const need = sentenceKana(text).length;
      const mine: UnitResult[] = [];
      for (let got = 0; got < need && i < units.length; i++) {
        mine.push(units[i]);
        got += units[i].kana.length;
      }
      return { text, units: mine };
    });
}

/** 띄어 쓴 정답 발음(어절마다 공백). 생략 가능한 장음은 빈칸이라 빠진다. */
export const spacedExpected = (chunks: { units: UnitResult[] }[]) =>
  chunks.map((c) => c.units.map((u) => u.expected).join("")).join(" ");
