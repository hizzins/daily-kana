import { useEffect, useState } from "react";
import type { Screen, Settings } from "../App";
import { LEVELS, type Manifest, loadLevel, loadSentences, readSetting, writeSetting } from "../data";
import { type Level, type ReviewDb, cardMode, isMastered, localDay } from "../db";
import { type Notice, type StorageEnv, homeNotice } from "../storage-guard";

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
  storage: StorageEnv | null;
  settings: Settings;
  onSettings: (s: Settings) => void;
  go: (s: Screen) => void;
}) {
  const { manifest, db, storage, settings, onSettings, go } = props;
  const { deck, mode } = settings;
  const isReady = (level: Level) => !!manifest[level]?.ready && (deck === "word" || !!manifest[level]?.sentences);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!storage) return;
    let alive = true;
    db.cardCount().then(
      (n) => alive && setNotice(homeNotice(storage, n > 0, readSetting("storageNoticeDismissed", false))),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [db, storage]);

  const dismiss = () => {
    writeSetting("storageNoticeDismissed", true);
    setNotice(null);
  };

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

      {notice && storage && <StorageNotice notice={notice} standalone={storage.standalone} onDismiss={dismiss} go={go} />}

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

function StorageNotice(props: { notice: Notice; standalone: boolean; onDismiss: () => void; go: (s: Screen) => void }) {
  const { notice, standalone, onDismiss, go } = props;
  if (notice === "ios-install")
    return (
      <section className="banner warn" role="note">
        <strong>아이폰은 홈 화면에 추가해서 쓰세요</strong>
        <p>Safari 아래 공유 버튼 → "홈 화면에 추가"를 누른 뒤 홈 화면 아이콘으로 열어 공부하세요.
          Safari에서 쌓은 기록은 홈 화면 앱으로 넘어가지 않아요.</p>
        <div className="actions"><button onClick={onDismiss}>Safari에서 계속하기</button></div>
      </section>
    );
  if (notice === "ios-move")
    return (
      <section className="banner warn" role="note">
        <strong>Safari에 쌓인 기록을 홈 화면 앱으로 옮기세요</strong>
        <ol className="plain">
          <li>통계 → 내보내기로 기록 파일을 저장</li>
          <li>Safari 공유 버튼 → "홈 화면에 추가"</li>
          <li>홈 화면 앱에서 통계 → 가져오기로 그 파일을 선택</li>
        </ol>
        <div className="actions">
          <button className="primary" onClick={() => go({ name: "stats" })}>통계로 가기</button>
          <button onClick={onDismiss}>다시 보지 않기</button>
        </div>
      </section>
    );
  return (
    <section className="banner warn" role="note">
      <strong>이 브라우저는 기록을 오래 보관한다고 약속하지 않았어요</strong>
      <p>저장 공간이 모자라면 브라우저가 기록을 지울 수 있어요.
        {standalone ? " 가끔 통계 → 내보내기로 백업해 두세요." : " 홈 화면에 설치해서 쓰거나, 가끔 통계 → 내보내기로 백업해 두세요."}</p>
      <div className="actions"><button onClick={onDismiss}>확인</button></div>
    </section>
  );
}
