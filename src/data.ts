// 앱 데이터(public/data) 불러오기. build 가 만든 레벨별 JSON 을 필요할 때 한 번만 받는다.
import type { AppEntry } from "../scripts/data";
import type { Level } from "./db";

export type { AppEntry };
export const LEVELS: Level[] = ["n5", "n4", "n3", "n2", "n1"];
export type Manifest = Record<Level, { ready: boolean; kana: number; kanji: number }>;

const url = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(url(path));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadManifest = () => getJson<Manifest>("levels.json");

const cache = new Map<Level, Promise<AppEntry[]>>();
export function loadLevel(level: Level): Promise<AppEntry[]> {
  if (!cache.has(level)) cache.set(level, getJson<AppEntry[]>(`${level}.json`));
  return cache.get(level)!;
}

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
