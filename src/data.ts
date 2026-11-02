// 앱 데이터(public/data) 불러오기. build 가 만든 레벨별 JSON 을 필요할 때 한 번만 받는다.
import type { AppEntry } from "../scripts/data";
import type { Level } from "./db";
import type { SentenceEntry } from "./sentence";

export type { AppEntry, SentenceEntry };
export const LEVELS: Level[] = ["n5", "n4", "n3", "n2", "n1"];
export type Manifest = Record<Level, { ready: boolean; kana: number; kanji: number; sentences?: number }>;

const url = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(url(path));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadManifest = () => getJson<Manifest>("levels.json");

/** 실패한 요청은 캐시에서 빼서, 오프라인에서 못 받은 레벨을 연결된 뒤 다시 받을 수 있게 한다. */
function cached<T>(cache: Map<Level, Promise<T>>, level: Level, path: string): Promise<T> {
  if (!cache.has(level)) {
    const p = getJson<T>(path);
    cache.set(level, p);
    p.catch(() => cache.delete(level));
  }
  return cache.get(level)!;
}

const cache = new Map<Level, Promise<AppEntry[]>>();
export const loadLevel = (level: Level) => cached(cache, level, `${level}.json`);

const sentenceCache = new Map<Level, Promise<SentenceEntry[]>>();
export const loadSentences = (level: Level) => cached(sentenceCache, level, `${level}-sentences.json`);

export const OFFLINE_HINT = "인터넷에 연결된 상태에서 한 번 열면 그다음부터는 오프라인에서도 열려요.";

// 설정은 이 기기 브라우저에만(localStorage). 사생활 모드 등에서 실패하면 기본값으로 동작한다.
export function readSetting<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`dk.${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function writeSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(`dk.${key}`, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 이번 실행에는 영향 없음 */
  }
}
