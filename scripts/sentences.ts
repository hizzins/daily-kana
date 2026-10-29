// 문장 데이터 검사·변환: data/sentences/<level>.json → public/data/<level>-sentences.json.
// 생성 지침은 gen-sentences.prompt.md. 문제가 하나라도 있으면 build 가 아무것도 쓰지 않는다.
import { createHash } from "node:crypto";
import { type SentenceEntry, gradingSentence } from "../src/sentence";
import { splitKana } from "../src/grade/reading";

export interface RawSentence {
  ja: string;
  kana: string;
  pron?: string; // 자동 규칙이 틀릴 때만
  ko: string;
  words: string[]; // 사전형 표제어, 겹치면 "word:reading"
}

export interface WordRef {
  word: string;
  reading: string;
  other_readings?: string[];
  ko_primary: string;
}

const PUNCT = "。、？！";
const KANJI = /[一-鿿々]/;
const KANA_ONLY = /^[ぁ-ゖァ-ヺー 。、？！]+$/;
const SOUNDS: Record<string, string> = { は: "わ", へ: "え", を: "お" };

export const sentenceId = (ja: string) => `s-${createHash("sha1").update(ja).digest("hex").slice(0, 10)}`;

/** 실제 발음 가나. を는 늘 お, 어절 끝(공백·문장부호·끝 앞)의 は·へ는 わ·え. */
export function derivePron(kana: string): string {
  const chars = Array.from(kana);
  return chars
    .map((c, i) => {
      const next = chars[i + 1];
      const atEnd = next === undefined || next === " " || PUNCT.includes(next);
      if (c === "を") return "お";
      if ((c === "は" || c === "へ") && atEnd) return SOUNDS[c];
      return c;
    })
    .join("");
}

export function buildSentences(
  raw: RawSentence[],
  vocab: WordRef[],
): { out: SentenceEntry[]; problems: { n: number; ja: string; detail: string }[] } {
  const problems: { n: number; ja: string; detail: string }[] = [];
  const out: SentenceEntry[] = [];
  const seen = new Set<string>();
  raw.forEach((r, idx) => {
    const n = idx + 1;
    const bad = (detail: string) => problems.push({ n, ja: r.ja, detail });
    if (!r.ja?.trim() || !r.kana?.trim() || !r.ko?.trim()) return bad("ja·kana·ko 중 빈 칸");
    if (seen.has(r.ja)) bad("같은 문장이 또 있음");
    seen.add(r.ja);
    if (/[0-9０-９]/.test(r.ja)) bad("숫자는 한자로");
    if (!KANA_ONLY.test(r.kana)) bad("kana 에 가나·ー·공백·。、？！ 밖의 글자");
    if (/^ | $| {2}/.test(r.kana)) bad("kana 공백은 어절 사이 하나씩");
    try {
      splitKana(gradingSentence(r.kana));
    } catch (e) {
      bad(`kana 를 발음 단위로 못 나눔: ${e instanceof Error ? e.message : e}`);
    }
    const pron = r.pron ?? derivePron(r.kana);
    const a = Array.from(r.kana);
    const b = Array.from(pron);
    if (a.length !== b.length) bad("pron 길이가 kana 와 다름");
    else if (a.some((c, i) => c !== b[i] && SOUNDS[c] !== b[i])) bad("pron 은 は→わ·へ→え·を→お 만 바꿀 수 있음");

    const words: SentenceEntry["words"] = [];
    for (const w of r.words ?? []) {
      const [word, reading] = w.split(":");
      let hits = vocab.filter((v) => v.word === word && (!reading || v.reading === reading));
      if (!hits.length && !reading) hits = vocab.filter((v) => v.reading === word && !KANJI.test(v.word));
      if (hits.length !== 1) {
        bad(`단어 ${w}: ${hits.length ? `${hits.length}개와 겹침 — "word:reading" 으로` : "레벨 단어에 없음"}`);
        continue;
      }
      // 문장에 실제로 나온 읽기를 보인다(私: 대표 わたくし 대신 わたし).
      const h = hits[0];
      const used = [h.reading, ...(h.other_readings ?? [])].find((x) => r.kana.includes(x)) ?? h.reading;
      words.push({ word: h.word, reading: used, ko: h.ko_primary });
    }
    out.push({ id: sentenceId(r.ja), ja: r.ja, kana: r.kana, pron, ko: r.ko, kanji: KANJI.test(r.ja), words });
  });
  return { out, problems };
}
