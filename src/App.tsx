import { useEffect, useState } from "react";
import { type Manifest, loadManifest, readSetting, writeSetting } from "./data";
import { DEFAULT_NEW_PER_DAY, type Level, type Mode, ReviewDb } from "./db";
import About from "./screens/About";
import Home from "./screens/Home";
import Quiz from "./screens/Quiz";
import Stats from "./screens/Stats";

export type Screen =
  | { name: "home" }
  | { name: "quiz"; level: Level; mode: Mode; only?: string[] }
  | { name: "stats" }
  | { name: "about" };

export interface Settings {
  mode: Mode;
  newPerDay: number;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [db, setDb] = useState<ReviewDb | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettingsState] = useState<Settings>(() => ({
    mode: readSetting<Mode>("mode", "kana"),
    newPerDay: readSetting("newPerDay", DEFAULT_NEW_PER_DAY),
  }));

  useEffect(() => {
    loadManifest().then(setManifest, (e) => setError(`단어 목록을 불러오지 못했어요: ${e.message}`));
    ReviewDb.open().then(setDb, (e) => setError(`기록 저장소를 열지 못했어요: ${e.message}`));
  }, []);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    writeSetting("mode", s.mode);
    writeSetting("newPerDay", s.newPerDay);
  };

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!manifest || !db) return <main className="page"><p className="muted">불러오는 중…</p></main>;

  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };

  return (
    <main className="page">
      {screen.name === "home" && <Home manifest={manifest} db={db} settings={settings} onSettings={setSettings} go={go} />}
      {screen.name === "quiz" && (
        <Quiz key={`${screen.level}:${screen.mode}:${screen.only?.join(",") ?? ""}`} db={db} level={screen.level}
          mode={screen.mode} only={screen.only} newPerDay={settings.newPerDay} go={go} />
      )}
      {screen.name === "stats" && <Stats manifest={manifest} db={db} go={go} />}
      {screen.name === "about" && <About go={go} />}
    </main>
  );
}
