import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { type AppEntry, LEVELS, type Manifest, type SentenceEntry, loadLevel, loadSentences, writeSetting } from "../data";
import { type Card, type CardMode, type Level, type ReviewDb, ImportError, isMastered, localDay, parseExport } from "../db";
import { mistakes, weeklyAccuracy } from "../quiz-logic";

type Progress = { total: number; mastered: number; started: number };
interface LevelStat {
  level: Level;
  label: string;
  kana: Progress;
  kanji: Progress;
}

type Shown = { kind: "word"; e: AppEntry } | { kind: "sentence"; e: SentenceEntry };
const MODE_LABEL: Record<CardMode, string> = { kana: "가나", kanji: "한자", "s-kana": "문장 · 가나", "s-kanji": "문장 · 한자" };

/** 레벨별 진도, 최근 7일 정답률, 오답 노트(다시 풀기), 내보내기/가져오기. */
export default function Stats(props: { manifest: Manifest; db: ReviewDb; go: (s: Screen) => void }) {
  const { manifest, db, go } = props;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [entries, setEntries] = useState<Map<string, Shown>>(new Map());
  const [levels, setLevels] = useState<LevelStat[]>([]);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const all = (await db.export()).cards;
    const ready = LEVELS.filter((l) => manifest[l]?.ready);
    const lists = await Promise.all(ready.map((l) => loadLevel(l)));
    const sentenceLists = await Promise.all(ready.map((l) => (manifest[l]?.sentences ? loadSentences(l) : [])));
    const map = new Map<string, Shown>();
    lists.flat().forEach((e) => map.set(e.id, { kind: "word", e }));
    sentenceLists.flat().forEach((e) => map.set(e.id, { kind: "sentence", e }));
    const stat = (level: Level, mode: CardMode, list: { id: string; kanji: boolean }[]): Progress => {
      const ids = new Set(list.filter((e) => !mode.endsWith("kanji") || e.kanji).map((e) => e.id));
      const mine = all.filter((c) => c.level === level && c.mode === mode && ids.has(c.id));
      return { total: ids.size, mastered: mine.filter(isMastered).length, started: mine.length };
    };
    setLevels(
      ready.flatMap((level, i) => [
        { level, label: `${level.toUpperCase()} 단어`, kana: stat(level, "kana", lists[i]), kanji: stat(level, "kanji", lists[i]) },
        ...(sentenceLists[i].length
          ? [{ level, label: `${level.toUpperCase()} 문장`, kana: stat(level, "s-kana", sentenceLists[i]), kanji: stat(level, "s-kanji", sentenceLists[i]) }]
          : []),
      ]),
    );
    setEntries(map);
    setCards(all);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportFile = async () => {
    const data = await db.export();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-kana-${localDay()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    writeSetting("lastExport", new Date().toISOString());
    setMessage(`카드 ${data.cards.length}개를 내보냈어요.`);
  };

  const importFile = async (file: File) => {
    try {
      const data = parseExport(await file.text());
      if (!window.confirm(`이 파일의 카드 ${data.cards.length}개로 지금 기록을 바꿀까요? 지금 기록은 사라져요.`)) return;
      await db.replaceAll(data);
      setMessage(`카드 ${data.cards.length}개를 가져왔어요.`);
      await reload();
    } catch (e) {
      setMessage(e instanceof ImportError || e instanceof Error ? `가져오지 못했어요: ${e.message}` : "가져오지 못했어요");
    }
  };

  if (!cards) return <p className="muted">불러오는 중…</p>;
  const weekly = weeklyAccuracy(cards);
  const wrong = mistakes(cards).filter((c) => entries.has(c.id));
  const groups = new Map<string, Card[]>();
  for (const c of wrong) groups.set(`${c.level}:${c.mode}`, [...(groups.get(`${c.level}:${c.mode}`) ?? []), c]);

  return (
    <>
      <header className="top">
        <button className="link" onClick={() => go({ name: "home" })}>← 레벨</button>
        <h1>통계</h1>
      </header>

      <section className="card">
        <h2>진도</h2>
        <table className="units">
          <thead><tr><th>레벨</th><th>가나 익힘</th><th>한자 익힘</th></tr></thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td>{l.kana.mastered} / {l.kana.total} <span className="muted">(시작 {l.kana.started})</span></td>
                <td>{l.kanji.mastered} / {l.kanji.total} <span className="muted">(시작 {l.kanji.started})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>최근 7일 정답률: {weekly ? <strong>{Math.round(weekly.rate * 100)}%</strong> : "기록 없음"}
          {weekly && <span className="muted"> ({weekly.count}문제, △는 절반으로 셈)</span>}</p>
      </section>

      <section className="card">
        <h2>오답 노트</h2>
        {wrong.length === 0 && <p className="muted">틀린 단어가 없어요.</p>}
        {[...groups.entries()].map(([key, list]) => {
          const [level, mode] = key.split(":") as [Level, CardMode];
          const deck = mode.startsWith("s-") ? "sentence" : "word";
          const view = mode.endsWith("kanji") ? "kanji" : "kana";
          return (
            <div key={key} className="group">
              <div className="group-head">
                <strong>{level.toUpperCase()} · {MODE_LABEL[mode]}</strong> <span className="muted">{list.length}개</span>
                <button onClick={() => go({ name: "quiz", level, deck, mode: view, only: list.map((c) => c.id) })}>다시 풀기</button>
              </div>
              <p className="wrong-list">
                {list.slice(0, 40).map((c) => {
                  const s = entries.get(c.id)!;
                  if (s.kind === "sentence")
                    return <span key={c.key} className="chip" lang="ja">{view === "kanji" && s.e.kanji ? s.e.ja : s.e.kana}</span>;
                  return <span key={c.key} className="chip" lang="ja">{view === "kanji" ? s.e.word : s.e.reading} <span className="muted" lang="ko">{s.e.ko_primary}</span></span>;
                })}
              </p>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>기록 백업</h2>
        <p className="muted">기록은 이 기기 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 내보내 두세요.</p>
        <div className="actions">
          <button className="primary" onClick={() => void exportFile()}>내보내기</button>
          <button onClick={() => fileRef.current?.click()}>가져오기</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        </div>
        {message && <p role="status">{message}</p>}
      </section>
    </>
  );
}
