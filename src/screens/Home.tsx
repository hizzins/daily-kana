import { useEffect, useState } from "react";
import type { Screen, Settings } from "../App";
import { LEVELS, type Manifest, loadLevel, loadSentences } from "../data";
import { type Level, type ReviewDb, cardMode, isMastered, localDay } from "../db";

interface Row {
  level: Level;
  ready: boolean;
  total: number;
  mastered: number;
  due: number;
}

/** 레벨 선택. 칸마다 지금 단어/문장·모드 기준 진도(익힘/전체)와 오늘 복습 수. 데이터가 없는 레벨은 "준비 중". */
export default function Home(props: {
  manifest: Manifest;
  db: ReviewDb;
  settings: Settings;
  onSettings: (s: Settings) => void;
  go: (s: Screen) => void;
}) {
  const { manifest, db, settings, onSettings, go } = props;
  const { deck, mode } = settings;
  const isReady = (level: Level) => !!manifest[level]?.ready && (deck === "word" || !!manifest[level]?.sentences);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    const today = localDay();
    Promise.all(
      LEVELS.map(async (level): Promise<Row> => {
        if (!isReady(level)) return { level, ready: false, total: 0, mastered: 0, due: 0 };
        const cm = cardMode(deck, mode);
        const [cards, due, entries] = await Promise.all([
          db.cards(level, cm), db.dueCount(level, cm, today), deck === "word" ? loadLevel(level) : loadSentences(level),
        ]);
        const ids = new Set<string>(entries.filter((e) => mode === "kana" || e.kanji).map((e) => e.id));
        const mastered = [...cards.values()].filter((c) => ids.has(c.id) && isMastered(c)).length;
        return { level, ready: true, total: ids.size, mastered, due };
      }),
    ).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, db, deck, mode]);

  return (
    <>
      <header className="top">
        <h1>daily-kana</h1>
        <nav>
          <button className="link" onClick={() => go({ name: "stats" })}>통계</button>
          <button className="link" onClick={() => go({ name: "about" })}>정보</button>
        </nav>
      </header>

      <div className="segmented" role="radiogroup" aria-label="문제 종류">
        {(["word", "sentence"] as const).map((d) => (
          <button key={d} role="radio" aria-checked={deck === d} className={deck === d ? "on" : ""}
            onClick={() => onSettings({ ...settings, deck: d })}>
            {d === "word" ? "단어" : "문장"}
          </button>
        ))}
      </div>

      <div className="segmented" role="radiogroup" aria-label="보기 모드">
        {(["kana", "kanji"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""}
            onClick={() => onSettings({ ...settings, mode: m })}>
            {m === "kana" ? "가나로 보기" : "한자로 보기"}
          </button>
        ))}
      </div>

      <ul className="levels">
        {(rows ?? LEVELS.map((level) => ({ level, ready: isReady(level), total: 0, mastered: 0, due: 0 }))).map((r) => (
          <li key={r.level}>
            <button className="level" disabled={!r.ready} onClick={() => go({ name: "quiz", level: r.level, deck, mode })}>
              <span className="level-name">{r.level.toUpperCase()}</span>
              {r.ready ? (
                <>
                  <span className="level-progress">익힘 {r.mastered} / {r.total}</span>
                  <span className={r.due ? "badge" : "badge quiet"}>오늘 복습 {r.due}</span>
                  <span className="bar" aria-hidden>
                    <span style={{ width: `${r.total ? (r.mastered / r.total) * 100 : 0}%` }} />
                  </span>
                </>
              ) : (
                <span className="muted">준비 중</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <label className="setting">
        하루 새 {deck === "word" ? "단어" : "문장"}
        <select value={settings.newPerDay} onChange={(e) => onSettings({ ...settings, newPerDay: Number(e.target.value) })}>
          {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}개</option>)}
        </select>
      </label>
    </>
  );
}
