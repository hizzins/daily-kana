// 뜻 채점: 쉼표로 나눈 입력 항목을 정답 목록과 정확히 비교한다(유사 일치 없음).
// 정규화는 입력과 정답 목록 양쪽에 똑같이, 공백·괄호·끝 "하다"·영문 대소문자만 다룬다(D15).
// 조사나 "~것"은 떼지 않는다 — 사과→사, 이것→이 처럼 명사를 자르기 때문.

export interface MeaningEntry {
  ko_primary: string;
  ko_accept: string[];
  homophones?: { id: string; word: string; ko_primary: string; ko_accept: string[] }[];
}

export type MeaningVerdict = "correct" | "partial" | "wrong";

export interface MeaningItem {
  text: string; // 사용자가 쓴 그대로
  ok: boolean;
  homophoneId?: string; // 동음이의어 뜻으로 맞았으면 그 항목 id
}

export interface MeaningResult {
  verdict: MeaningVerdict;
  items: MeaningItem[];
  unmatched: string[]; // 정답 목록에 없던 입력 항목(채점 화면에 표시)
}

export function normalizeMeaning(s: string): string {
  const t = s
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return t.endsWith("하다") && t.length > 2 ? t.slice(0, -2) : t;
}

const splitItems = (input: string) =>
  input
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * 뜻 입력을 채점한다. 항목이 모두 정답 목록에 있으면 correct, 일부만 있으면 partial, 하나도 없으면 wrong.
 * 가나로 보인 문제는 같은 읽기의 다른 단어 뜻(homophones)도 정답으로 본다 — 가나만으로는 어느 단어인지 알 수 없다.
 */
export function gradeMeaning(entry: MeaningEntry, input: string, shownAs: "kana" | "kanji"): MeaningResult {
  const own = new Set([entry.ko_primary, ...entry.ko_accept].map(normalizeMeaning));
  const others = new Map<string, string>();
  if (shownAs === "kana")
    for (const h of entry.homophones ?? [])
      for (const m of [h.ko_primary, ...h.ko_accept]) {
        const k = normalizeMeaning(m);
        if (!own.has(k) && !others.has(k)) others.set(k, h.id);
      }

  const items: MeaningItem[] = splitItems(input).map((text) => {
    const k = normalizeMeaning(text);
    if (k && own.has(k)) return { text, ok: true };
    if (k && others.has(k)) return { text, ok: true, homophoneId: others.get(k) };
    return { text, ok: false };
  });
  const okCount = items.filter((i) => i.ok).length;
  const verdict: MeaningVerdict =
    items.length > 0 && okCount === items.length ? "correct" : okCount > 0 ? "partial" : "wrong";
  return { verdict, items, unmatched: items.filter((i) => !i.ok).map((i) => i.text) };
}
