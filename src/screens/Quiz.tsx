import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { type AppEntry, OFFLINE_HINT, type SentenceEntry, loadLevel, loadSentences } from "../data";
import { type Deck, type Level, type Mode, type ReviewDb, StorageError, buildSession, cardMode, localDay } from "../db";
import { type MeaningResult, gradeMeaning } from "../grade/meaning";
import { type ReadingResult, gradeReading } from "../grade/reading";
import { explainUnits, readingTargets, shownAs, shownWord } from "../quiz-logic";
import { chunkUnits, sentenceShownAs, sentenceTargets, shownSentence, spacedExpected } from "../sentence";
import { useJapaneseSpeech } from "../speech";

type Item = { deck: "word"; entry: AppEntry } | { deck: "sentence"; entry: SentenceEntry };

interface Graded {
  item: Item;
  readingInput: string;
  meaningInput: string;
  reading: ReadingResult;
  meaning: MeaningResult | null; // 문장은 뜻을 묻지 않는다
}

// 한글 조합 중 Enter(isComposing / keyCode 229)는 무시한다 — 칸을 두 번 넘기거나 마지막 음절이 빠지는 것을 막는다.
const isPlainEnter = (e: KeyboardEvent) => e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;

/** 문제 → 채점을 한 화면에서. 문제와 채점이 같은 상태(내 답)를 써서 화면을 나누지 않는다(D1). 단어·문장 공용. */
export default function Quiz(props: {
  db: ReviewDb;
  level: Level;
  deck: Deck;
  mode: Mode;
  only?: string[];
  newPerDay: number;
  go: (s: Screen) => void;
}) {
  const { db, level, deck, mode, only, newPerDay, go } = props;
  const cm = cardMode(deck, mode);
  const [entries, setEntries] = useState<Map<string, Item> | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [readingInput, setReadingInput] = useState("");
  const [meaningInput, setMeaningInput] = useState("");
  const [graded, setGraded] = useState<Graded | null>(null);
  const [saveError, setSaveError] = useState<StorageError | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tally, setTally] = useState({ done: 0, correct: 0 });
  const readingRef = useRef<HTMLInputElement>(null);
  const meaningRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const items: Item[] =
        deck === "word"
          ? (await loadLevel(level)).map((entry) => ({ deck, entry }))
          : (await loadSentences(level)).map((entry) => ({ deck, entry }));
      const pool = items.filter((it) => mode === "kana" || it.entry.kanji); // 한자 모드는 한자가 있는 것만(D8)
      const map = new Map(pool.map((it) => [it.entry.id, it]));
      let ids: string[];
      if (only) ids = only.filter((id) => map.has(id));
      else {
        const s = buildSession([...map.keys()], await db.cards(level, cm), localDay(), newPerDay);
        ids = [...s.review, ...s.fresh];
      }
      if (!alive) return;
      setEntries(map);
      setQueue(ids);
    })().catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [db, level, deck, mode, cm, only, newPerDay]);

  useEffect(() => {
    if (graded) nextRef.current?.focus();
    else readingRef.current?.focus();
  }, [graded, pos]);

  if (loadError)
    return (
      <section className="card center">
        <h2>문제를 불러오지 못했어요</h2>
        <p className="muted">{OFFLINE_HINT}</p>
        <div className="actions"><button className="primary" onClick={() => go({ name: "home" })}>처음으로</button></div>
      </section>
    );
  if (!entries) return <p className="muted">불러오는 중…</p>;
  const id = queue[pos];
  const item = id ? entries.get(id) : undefined;
  const levelLabel = `${level.toUpperCase()} · ${deck === "sentence" ? "문장 · " : ""}${mode === "kana" ? "가나" : "한자"}`;

  if (!item)
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

  const isSentence = item.deck === "sentence";
  const ready = !!readingInput.trim() && (isSentence || !!meaningInput.trim());

  const submit = async () => {
    if (!ready || graded) return;
    const entryId = item.entry.id;
    let reading: ReadingResult;
    let meaning: MeaningResult | null = null;
    if (item.deck === "sentence") {
      reading = gradeReading(sentenceTargets(item.entry), readingInput, sentenceShownAs(item.entry, mode));
    } else {
      const how = shownAs(item.entry, mode);
      reading = gradeReading(readingTargets(item.entry, mode), readingInput, how);
      meaning = gradeMeaning(item.entry, meaningInput, how);
    }
    setGraded({ item, readingInput, meaningInput, reading, meaning });
    const verdict = meaning?.verdict ?? "correct"; // 문장은 발음만 본다
    const perfect = reading.correct && verdict === "correct";
    setTally((t) => ({ done: t.done + 1, correct: t.correct + (perfect ? 1 : 0) }));
    // 발음 ✗ 이나 뜻 ✗ 이면 오늘 다시 — 이번 세션 끝에 한 번 더 낸다.
    if ((!reading.correct || verdict === "wrong") && !queue.slice(pos + 1).includes(entryId))
      setQueue((q) => [...q, entryId]);
    try {
      await db.record({
        id: entryId, level, mode: cm, reading: reading.correct, meaning: verdict,
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
        graded.item.deck === "sentence" ? (
          <SentenceResult g={graded} entry={graded.item.entry} mode={mode} onNext={next} nextRef={nextRef} />
        ) : (
          <Result g={graded} entry={graded.item.entry} mode={mode} onNext={next} nextRef={nextRef} />
        )
      ) : (
        <section className="card">
          <p className="eyebrow center">{levelLabel}</p>
          {item.deck === "sentence" ? (
            <p className="sentence center" lang="ja">{shownSentence(item.entry, mode)}</p>
          ) : (
            <p className="word center" lang="ja">{shownWord(item.entry, mode)}</p>
          )}
          <p className="muted center">{isSentence ? "한글로 어떻게 읽을까?" : "한글로 어떻게 읽고, 무슨 뜻일까?"}</p>
          <label className="field">
            한글 발음
            <input ref={readingRef} value={readingInput} onChange={(e) => setReadingInput(e.target.value)}
              onKeyDown={(e) => {
                if (!isPlainEnter(e)) return;
                e.preventDefault();
                if (isSentence) void submit();
                else meaningRef.current?.focus();
              }}
              placeholder={isSentence ? "문장 발음 입력 (띄어쓰기는 자유)" : "발음 입력"}
              autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          {!isSentence && (
            <label className="field">
              한국어 뜻
              <input ref={meaningRef} value={meaningInput} onChange={(e) => setMeaningInput(e.target.value)}
                onKeyDown={(e) => { if (isPlainEnter(e)) { e.preventDefault(); void submit(); } }}
                placeholder="뜻 입력 (여러 개면 쉼표로)" autoComplete="off" spellCheck={false} />
            </label>
          )}
          <button className="primary wide" disabled={!ready} onClick={() => void submit()}>
            정답 제출하기 →
          </button>
        </section>
      )}
    </>
  );
}

interface ResultProps<E> {
  g: Graded;
  entry: E;
  mode: Mode;
  onNext: () => void;
  nextRef: React.RefObject<HTMLButtonElement | null>;
}

function Result(props: ResultProps<AppEntry>) {
  const { g, entry, mode, onNext, nextRef } = props;
  const reading = g.reading;
  const meaning = g.meaning!;
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

      <Confusions reading={reading} />
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

function Confusions({ reading }: { reading: ReadingResult }) {
  if (!reading.confusions.length) return null;
  return (
    <div className="pairs">
      {reading.confusions.flatMap((c, i) => [
        <div className="pair" key={`${i}a`}><span className="pair-kana" lang="ja">{c.expected.kana}</span><b>{c.expected.hangul}</b><small>{c.expected.note}</small></div>,
        <div className="pair" key={`${i}b`}><span className="pair-kana" lang="ja">{c.got.kana}</span><b>{c.got.hangul}</b><small>{c.got.note}</small></div>,
      ])}
    </div>
  );
}

const MAX_EXPLAIN = 5; // 문장은 틀린 곳이 많을 수 있어 설명을 앞에서 몇 줄만

/** 문장 채점 결과: 어절별 정답 발음(틀린 글자는 내 답과 함께), 듣기, 번역, 문장 속 단어. */
function SentenceResult(props: ResultProps<SentenceEntry>) {
  const { g, entry, mode, onNext, nextRef } = props;
  const { reading } = g;
  const speech = useJapaneseSpeech();
  const chunks = chunkUnits(entry.kana, reading.units);
  const explain = explainUnits(reading);
  const headline = reading.correct
    ? { icon: "✓", cls: "ok", text: "정답이야!" }
    : { icon: "✕", cls: "ng", text: "아쉽게 오답이야." };

  return (
    <section className="card">
      <p className={`headline ${headline.cls}`}><span aria-hidden>{headline.icon}</span> {headline.text}</p>

      <div className="center">
        <p className="sentence" lang="ja">{shownSentence(entry, mode)}</p>
        {sentenceShownAs(entry, mode) === "kanji" && <p className="muted" lang="ja">{entry.kana}</p>}
        {speech.available ? (
          <div className="actions">
            <button onClick={() => speech.speak(entry.ja)}>▶ 듣기</button>
            <button onClick={() => speech.speak(entry.ja, 0.6)}>천천히 듣기</button>
          </div>
        ) : (
          <p className="muted">이 기기에는 일본어 음성이 없어서 듣기를 쓸 수 없어요.</p>
        )}
        <p className="muted">내 답: {g.readingInput}</p>
        <p><strong>정답: {spacedExpected(chunks)}</strong></p>
      </div>

      <div className="ruby">
        {chunks.map((c, i) => (
          <span key={i} className="chunk">
            {c.units.map((u, j) => (
              <span key={j} className={u.ok ? "ru" : "ru ng"}>
                <span lang="ja">{u.kana}</span>
                <small>{u.expected || "–"}</small>
                {!u.ok && <small className="got">{u.got || "빠짐"}</small>}
              </span>
            ))}
          </span>
        ))}
      </div>
      <p><strong>{reading.total}글자 중 {reading.correctCount}글자</strong>를 정확하게 읽었어.</p>
      {explain.slice(0, MAX_EXPLAIN).map((line, i) => <p key={i}>{line}</p>)}
      {explain.length > MAX_EXPLAIN && <p className="muted">그 밖에 {explain.length - MAX_EXPLAIN}곳을 더 틀렸어. 위 표에서 빨간 글자를 확인해 봐.</p>}
      <Confusions reading={reading} />

      <h3>뜻</h3>
      <p>{entry.ko}</p>
      {entry.words.length > 0 && (
        <>
          <h3>문장 속 단어</h3>
          <p className="chips">
            {entry.words.map((w, i) => (
              <span key={i} className="chip">
                <span lang="ja">{w.word}</span>{w.word !== w.reading && <span lang="ja">({w.reading})</span>} <span className="muted">{w.ko}</span>
              </span>
            ))}
          </p>
        </>
      )}

      <button ref={nextRef} className="primary wide" onClick={onNext}>다음 문제 →</button>
    </section>
  );
}
