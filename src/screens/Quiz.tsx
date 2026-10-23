import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { type AppEntry, loadLevel } from "../data";
import { type Level, type Mode, type ReviewDb, StorageError, buildSession, localDay } from "../db";
import { type MeaningResult, gradeMeaning } from "../grade/meaning";
import { type ReadingResult, gradeReading } from "../grade/reading";
import { explainUnits, readingTargets, shownAs, shownWord } from "../quiz-logic";

interface Graded {
  entry: AppEntry;
  readingInput: string;
  meaningInput: string;
  reading: ReadingResult;
  meaning: MeaningResult;
}

// 한글 조합 중 Enter(isComposing / keyCode 229)는 무시한다 — 칸을 두 번 넘기거나 마지막 음절이 빠지는 것을 막는다.
const isPlainEnter = (e: KeyboardEvent) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;

/** 문제 → 채점을 한 화면에서. 문제와 채점이 같은 상태(내 답)를 써서 화면을 나누지 않는다(D1). */
export default function Quiz(props: {
  db: ReviewDb;
  level: Level;
  mode: Mode;
  only?: string[];
  newPerDay: number;
  go: (s: Screen) => void;
}) {
  const { db, level, mode, only, newPerDay, go } = props;
  const [entries, setEntries] = useState<Map<string, AppEntry> | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [readingInput, setReadingInput] = useState("");
  const [meaningInput, setMeaningInput] = useState("");
  const [graded, setGraded] = useState<Graded | null>(null);
  const [saveError, setSaveError] = useState<StorageError | null>(null);
  const [tally, setTally] = useState({ done: 0, correct: 0 });
  const readingRef = useRef<HTMLInputElement>(null);
  const meaningRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await loadLevel(level);
      const pool = list.filter((e) => mode === "kana" || e.kanji); // 한자 모드는 한자 표제어만(D8)
      const map = new Map(pool.map((e) => [e.id, e]));
      let ids: string[];
      if (only) ids = only.filter((id) => map.has(id));
      else {
        const s = buildSession(pool.map((e) => e.id), await db.cards(level, mode), localDay(), newPerDay);
        ids = [...s.review, ...s.fresh];
      }
      if (!alive) return;
      setEntries(map);
      setQueue(ids);
    })();
    return () => {
      alive = false;
    };
  }, [db, level, mode, only, newPerDay]);

  useEffect(() => {
    if (graded) nextRef.current?.focus();
    else readingRef.current?.focus();
  }, [graded, pos]);

  if (!entries) return <p className="muted">불러오는 중…</p>;
  const id = queue[pos];
  const entry = id ? entries.get(id) : undefined;
  const levelLabel = `${level.toUpperCase()} · ${mode === "kana" ? "가나" : "한자"}`;

  if (!entry)
    return (
      <section className="card center">
        <p className="eyebrow">{levelLabel}</p>
        <h2>{tally.done ? "오늘 학습 끝!" : "오늘은 풀 단어가 없어요"}</h2>
        {tally.done > 0 && <p>{tally.done}문제 중 {tally.correct}문제를 완전히 맞혔어요.</p>}
        <div className="actions">
          <button className="primary" onClick={() => go({ name: "home" })}>처음으로</button>
          <button onClick={() => go({ name: "stats" })}>통계 보기</button>
        </div>
      </section>
    );

  const submit = async () => {
    if (!readingInput.trim() || !meaningInput.trim() || graded) return;
    const how = shownAs(entry, mode);
    const reading = gradeReading(readingTargets(entry, mode), readingInput, how);
    const meaning = gradeMeaning(entry, meaningInput, how);
    setGraded({ entry, readingInput, meaningInput, reading, meaning });
    const perfect = reading.correct && meaning.verdict === "correct";
    setTally((t) => ({ done: t.done + 1, correct: t.correct + (perfect ? 1 : 0) }));
    // 발음 ✗ 이나 뜻 ✗ 이면 오늘 다시 — 이번 세션 끝에 한 번 더 낸다.
    if ((!reading.correct || meaning.verdict === "wrong") && !queue.slice(pos + 1).includes(entry.id))
      setQueue((q) => [...q, entry.id]);
    try {
      await db.record({
        id: entry.id, level, mode, reading: reading.correct, meaning: meaning.verdict,
        units: reading.units.map((u) => ({ kana: u.kana, ok: u.ok })),
      });
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof StorageError ? e : new StorageError(String(e), false));
    }
  };

  const next = () => {
    setGraded(null);
    setReadingInput("");
    setMeaningInput("");
    setPos((p) => p + 1);
  };

  const remaining = queue.length - pos;

  return (
    <>
      <header className="top">
        <button className="link" onClick={() => go({ name: "home" })}>← 레벨</button>
        <span className="muted">남은 문제 {remaining}</span>
      </header>
      {saveError && (
        <div className="banner warn" role="alert">
          {saveError.message}. 지금까지 기록을 잃지 않게 <button className="link" onClick={() => go({ name: "stats" })}>통계 → 내보내기</button>를 해 주세요.
        </div>
      )}
      {graded ? (
        <Result g={graded} mode={mode} onNext={next} nextRef={nextRef} />
      ) : (
        <section className="card">
          <p className="eyebrow center">{levelLabel}</p>
          <p className="word center" lang="ja">{shownWord(entry, mode)}</p>
          <p className="muted center">한글로 어떻게 읽고, 무슨 뜻일까?</p>
          <label className="field">
            한글 발음
            <input ref={readingRef} value={readingInput} onChange={(e) => setReadingInput(e.target.value)}
              onKeyDown={(e) => { if (isPlainEnter(e)) { e.preventDefault(); meaningRef.current?.focus(); } }}
              placeholder="발음 입력" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <label className="field">
            한국어 뜻
            <input ref={meaningRef} value={meaningInput} onChange={(e) => setMeaningInput(e.target.value)}
              onKeyDown={(e) => { if (isPlainEnter(e)) { e.preventDefault(); void submit(); } }}
              placeholder="뜻 입력 (여러 개면 쉼표로)" autoComplete="off" spellCheck={false} />
          </label>
          <button className="primary wide" disabled={!readingInput.trim() || !meaningInput.trim()} onClick={() => void submit()}>
            정답 제출하기 →
          </button>
        </section>
      )}
    </>
  );
}

function Result(props: { g: Graded; mode: Mode; onNext: () => void; nextRef: React.RefObject<HTMLButtonElement | null> }) {
  const { g, mode, onNext, nextRef } = props;
  const { reading, meaning, entry } = g;
  const perfect = reading.correct && meaning.verdict === "correct";
  const headline = perfect
    ? { icon: "✓", cls: "ok", text: "정답이야!" }
    : reading.correct && meaning.verdict === "partial"
      ? { icon: "△", cls: "partial", text: "발음은 맞았고, 뜻은 일부만 맞았어." }
      : { icon: "✕", cls: "ng", text: "아쉽게 오답이야." };
  const how = shownAs(entry, mode);
  const others = how === "kanji" ? entry.other_readings : [];
  const homophones = how === "kana" ? entry.homophones : [];

  return (
    <section className="card">
      <p className={`headline ${headline.cls}`}><span aria-hidden>{headline.icon}</span> {headline.text}</p>

      <div className="center">
        <p className="word" lang="ja">{shownWord(entry, mode)}</p>
        {how === "kanji" && <p className="muted" lang="ja">{entry.reading}</p>}
        <p className="muted">내 답: {g.readingInput}</p>
        <p><strong>정답: {reading.expected}</strong></p>
      </div>

      <table className="units">
        <thead><tr><th>가나</th><th>정답 발음</th><th>내 답</th><th>결과</th></tr></thead>
        <tbody>
          {reading.units.map((u, i) => (
            <tr key={i}>
              <td lang="ja">{u.kana}</td>
              <td>{u.expected || "(생략 가능)"}</td>
              <td>{u.got || "—"}</td>
              <td className={u.ok ? "ok" : "ng"}>{u.ok ? "✓" : "✕"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p><strong>{reading.total}글자 중 {reading.correctCount}글자</strong>를 정확하게 읽었어.</p>
      {explainUnits(reading).map((line, i) => <p key={i}>{line}</p>)}

      {reading.confusions.length > 0 && (
        <div className="pairs">
          {reading.confusions.flatMap((c, i) => [
            <div className="pair" key={`${i}a`}><span className="pair-kana" lang="ja">{c.expected.kana}</span><b>{c.expected.hangul}</b><small>{c.expected.note}</small></div>,
            <div className="pair" key={`${i}b`}><span className="pair-kana" lang="ja">{c.got.kana}</span><b>{c.got.hangul}</b><small>{c.got.note}</small></div>,
          ])}
        </div>
      )}
      {others.length > 0 && <p className="muted">다른 읽기도 정답: <span lang="ja">{others.join(", ")}</span></p>}

      <h3>뜻 <span className={meaning.verdict === "correct" ? "ok" : meaning.verdict === "partial" ? "partial" : "ng"}>
        {meaning.verdict === "correct" ? "✓" : meaning.verdict === "partial" ? "△" : "✕"}
      </span></h3>
      <p className="chips">
        내 답:{" "}
        {meaning.items.length ? meaning.items.map((it, i) => <span key={i} className={it.ok ? "chip ok" : "chip ng"}>{it.text}</span>) : "—"}
      </p>
      {meaning.unmatched.length > 0 && <p className="muted">정답 목록에 없는 말: {meaning.unmatched.join(", ")}</p>}
      <p><strong>정답: {entry.ko_primary}</strong>{entry.ko_accept.length > 0 && <span className="muted"> · 인정: {entry.ko_accept.join(", ")}</span>}</p>
      {homophones.length > 0 && (
        <p className="muted">이 가나는 다음 뜻도 있어요: {homophones.map((h) => `${h.ko_primary}(${h.word})`).join(", ")}</p>
      )}

      <button ref={nextRef} className="primary wide" onClick={onNext}>다음 문제 →</button>
    </section>
  );
}
