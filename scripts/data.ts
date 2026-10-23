// 단어 데이터 파이프라인. OpenJLPT 원천 + Claude Code 가 만든 한국어 뜻(data/ko) + 사람이 고친 항목(data/overrides.json)
// → 앱이 레벨별로 지연 로드하는 public/data/<level>.json.
//
//   npm run data -- fetch            원천을 고정 커밋에서 받고 해시를 SOURCE.json 에 기록
//   npm run data -- verify           받아 둔 원천이 SOURCE.json 해시와 같은지 확인
//   npm run data -- batch n5 [100]   뜻이 아직 없는 단어를 생성 입력 묶음으로(.work/batches)
//   npm run data -- build [--allow-partial]   검사 후 public/data 생성. 문제가 있으면 아무것도 쓰지 않고 실패
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { splitKana } from "../src/grade/reading";

export const LEVELS = ["n5", "n4", "n3", "n2", "n1"] as const;
export type Level = (typeof LEVELS)[number];

// OpenJLPT 에는 0.3.0 태그가 없어 meta.json 이 0.3.0 인 main 커밋에 고정한다.
const OPENJLPT = { version: "0.3.0", commit: "0d1d3410bec90bd4098a7c72de820543cb4f707c" };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "data/source", `openjlpt-${OPENJLPT.version}`);
const KO_DIR = join(ROOT, "data/ko");
const OVERRIDES_FILE = join(ROOT, "data/overrides.json");
const OUT_DIR = join(ROOT, "public/data");
const BATCH_DIR = join(ROOT, ".work/batches");

export interface SourceEntry {
  id: string;
  word: string;
  reading: string;
  meanings: string[];
  pos?: string[] | null;
  other_readings?: string[] | null;
}

export interface KoEntry {
  ko_primary: string;
  ko_accept: string[];
}

export interface Override {
  exclude?: boolean;
  word?: string;
  pron?: string; // 같은 길이의 실제 발음 가나(こんにちは → こんにちわ)
  ko_primary?: string;
  ko_accept?: string[];
}

export interface AppEntry {
  id: string;
  word: string;
  reading: string;
  other_readings: string[];
  pron?: string;
  kanji: boolean; // 한자 모드 출제 대상(표제어에 한자가 있음, D8)
  ko_primary: string;
  ko_accept: string[];
  homophones: { id: string; word: string; ko_primary: string; ko_accept: string[] }[];
}

export type ProblemKind =
  | "duplicate"
  | "duplicate-ko"
  | "missing-ko"
  | "empty-primary"
  | "bad-char"
  | "unsplittable"
  | "pron-length"
  | "unknown-override";

export interface Problem {
  level?: Level;
  id: string;
  word?: string;
  kind: ProblemKind;
  detail: string;
}

/** 채점에 쓰는 읽기. 접두·접미 표시 ～ 는 떼고 채점한다(화면은 원문 그대로). */
export const gradingReading = (r: string) => r.replace(/^[～〜]+|[～〜]+$/g, "");
/** 중복 판정 키. ID 가 아니라 내용으로 본다(같은 단어가 두 레벨에 다른 id 로 실릴 수 있다). */
export const contentKey = (e: SourceEntry) => `${e.word}|${e.reading}|${e.meanings[0] ?? ""}`;
// 한글·영문·숫자·공백·-·· 만. / , 가 있으면 항목이 둘로 읽혀 채점이 어긋난다(D15).
const KO_ALLOWED = /^[가-힣A-Za-z0-9 \-·]+$/;

function splittable(kana: string): string | null {
  try {
    splitKana(kana);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export interface BuildInput {
  sources: Partial<Record<Level, SourceEntry[]>>;
  ko: Partial<Record<Level, Record<string, KoEntry>>>;
  overrides: Record<string, Override>;
  koDuplicates?: Problem[];
  allowPartial?: boolean;
}

export interface BuildOutput {
  out: Partial<Record<Level, AppEntry[]>>;
  problems: Problem[];
  dropped: { level: Level; id: string; word: string; keptIn: Level }[];
  pronCandidates: { level: Level; id: string; word: string; reading: string }[];
}

/** 원천·뜻·수정 항목을 합쳐 검사하고 레벨별 앱 데이터를 만든다. 뜻 파일이 없는 레벨은 결과에서 빠진다("준비 중"). */
export function buildLevels(input: BuildInput): BuildOutput {
  const problems: Problem[] = [...(input.koDuplicates ?? [])];
  const dropped: BuildOutput["dropped"] = [];
  const pronCandidates: BuildOutput["pronCandidates"] = [];
  const knownIds = new Set<string>();

  // 1. 중복: 레벨 간 같은 내용이면 낮은 레벨(N5 쪽)만 남기고, 같은 레벨 안이면 문제로 막는다.
  const seen = new Map<string, Level>();
  const kept: Partial<Record<Level, SourceEntry[]>> = {};
  for (const level of LEVELS) {
    const list = input.sources[level];
    if (!list) continue;
    const here = new Set<string>();
    kept[level] = [];
    for (const e of list) {
      knownIds.add(e.id);
      const key = contentKey(e);
      if (here.has(key)) {
        problems.push({ level, id: e.id, word: e.word, kind: "duplicate", detail: `같은 레벨 안 중복: ${key}` });
        continue;
      }
      here.add(key);
      const first = seen.get(key);
      if (first) {
        dropped.push({ level, id: e.id, word: e.word, keptIn: first });
        continue;
      }
      seen.set(key, level);
      if (input.overrides[e.id]?.exclude) continue;
      kept[level]!.push(e);
    }
  }

  for (const id of Object.keys(input.overrides))
    if (!knownIds.has(id)) problems.push({ id, kind: "unknown-override", detail: "원천에 없는 id 의 수정 항목" });

  // 2. 레벨별 합치기와 검사
  const merged: { level: Level; entry: AppEntry }[] = [];
  for (const level of LEVELS) {
    const list = kept[level];
    const ko = input.ko[level];
    if (!list) continue;
    for (const e of list) {
      const o = input.overrides[e.id] ?? {};
      const reading = gradingReading(e.reading);
      if (!o.pron && /[はへ]$/.test(reading) && reading.length > 1)
        pronCandidates.push({ level, id: e.id, word: e.word, reading: e.reading });
      if (!ko) continue;

      const k = ko[e.id];
      if (!k && !o.ko_primary) {
        if (!input.allowPartial) problems.push({ level, id: e.id, word: e.word, kind: "missing-ko", detail: "한국어 뜻 없음" });
        continue;
      }
      const ko_primary = (o.ko_primary ?? k?.ko_primary ?? "").trim();
      const ko_accept = o.ko_accept ?? k?.ko_accept ?? [];
      const at = { level, id: e.id, word: e.word };
      if (!ko_primary) problems.push({ ...at, kind: "empty-primary", detail: "대표 뜻이 비어 있음" });
      for (const m of [ko_primary, ...ko_accept])
        if (m && !KO_ALLOWED.test(m)) problems.push({ ...at, kind: "bad-char", detail: `허용되지 않는 문자: "${m}"` });

      const readings = [reading, ...(e.other_readings ?? []).map(gradingReading)];
      for (const r of readings) {
        const err = splittable(r);
        if (err) problems.push({ ...at, kind: "unsplittable", detail: err });
      }
      if (o.pron) {
        if (Array.from(o.pron).length !== Array.from(reading).length)
          problems.push({ ...at, kind: "pron-length", detail: `pron "${o.pron}" 길이가 읽기 "${reading}"와 다름` });
        const err = splittable(o.pron);
        if (err) problems.push({ ...at, kind: "unsplittable", detail: `pron: ${err}` });
      }

      const word = o.word ?? e.word;
      merged.push({
        level,
        entry: {
          id: e.id,
          word,
          reading: e.reading,
          other_readings: e.other_readings ?? [],
          ...(o.pron ? { pron: o.pron } : {}),
          kanji: word !== e.reading,
          ko_primary,
          ko_accept,
          homophones: [],
        },
      });
    }
  }

  // 3. 동음이의: 뜻이 있는 전 레벨 항목을 읽기로 묶어 상대의 표시·채점 값을 복사한다(D6).
  const byReading = new Map<string, AppEntry[]>();
  for (const { entry } of merged) {
    const r = gradingReading(entry.reading);
    byReading.set(r, [...(byReading.get(r) ?? []), entry]);
  }
  for (const group of byReading.values())
    for (const a of group)
      a.homophones = group
        .filter((b) => b.id !== a.id)
        .map((b) => ({ id: b.id, word: b.word, ko_primary: b.ko_primary, ko_accept: b.ko_accept }));

  const out: BuildOutput["out"] = {};
  for (const level of LEVELS) if (input.ko[level]) out[level] = merged.filter((m) => m.level === level).map((m) => m.entry);
  return { out, problems, dropped, pronCandidates };
}

// ---------- 파일 입출력 ----------

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const writeJson = (path: string, data: unknown, pretty = true) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, pretty ? 1 : 0) + "\n");
};
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function loadSources(): Partial<Record<Level, SourceEntry[]>> {
  const out: Partial<Record<Level, SourceEntry[]>> = {};
  for (const level of LEVELS) {
    const path = join(SOURCE_DIR, `${level}.json`);
    if (existsSync(path)) out[level] = readJson<SourceEntry[]>(path);
  }
  return out;
}

/** data/ko 의 <level>.json 과 <level>-*.json(생성 묶음·표본)을 레벨별로 합친다. 같은 id 가 두 파일에 있으면 문제. */
function loadKo(): { ko: Partial<Record<Level, Record<string, KoEntry>>>; duplicates: Problem[] } {
  const ko: Partial<Record<Level, Record<string, KoEntry>>> = {};
  const from = new Map<string, string>();
  const duplicates: Problem[] = [];
  if (!existsSync(KO_DIR)) return { ko, duplicates };
  for (const file of readdirSync(KO_DIR).sort()) {
    const m = /^(n[1-5])(-.+)?\.json$/.exec(file);
    if (!m) continue;
    const level = m[1] as Level;
    const data = readJson<Record<string, KoEntry>>(join(KO_DIR, file));
    ko[level] ??= {};
    for (const [id, entry] of Object.entries(data)) {
      const prev = from.get(id);
      if (prev) duplicates.push({ level, id, kind: "duplicate-ko", detail: `${prev} 와 ${file} 에 모두 있음` });
      from.set(id, file);
      ko[level]![id] = entry;
    }
  }
  return { ko, duplicates };
}

async function fetchSources() {
  const base = `https://raw.githubusercontent.com/evanclan/OpenJLPT/${OPENJLPT.commit}/data/json`;
  const files: Record<string, string> = {};
  mkdirSync(SOURCE_DIR, { recursive: true });
  for (const name of ["meta.json", ...LEVELS.map((l) => `vocab/${l}.json`)]) {
    const res = await fetch(`${base}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const path = join(SOURCE_DIR, name.replace("vocab/", ""));
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    files[name.replace("vocab/", "")] = sha256(path);
    console.log(`받음 ${name}`);
  }
  const meta = readJson<{ version: string }>(join(SOURCE_DIR, "meta.json"));
  if (meta.version !== OPENJLPT.version) throw new Error(`meta.json 버전 ${meta.version} ≠ ${OPENJLPT.version}`);
  writeJson(join(SOURCE_DIR, "SOURCE.json"), { name: "OpenJLPT", ...OPENJLPT, files });
  console.log(`기록 ${join(SOURCE_DIR, "SOURCE.json")}`);
}

function verifySources(): boolean {
  const record = readJson<{ files: Record<string, string> }>(join(SOURCE_DIR, "SOURCE.json"));
  let ok = true;
  for (const [file, hash] of Object.entries(record.files)) {
    const actual = sha256(join(SOURCE_DIR, file));
    if (actual !== hash) {
      ok = false;
      console.error(`해시 불일치 ${file}`);
    }
  }
  console.log(ok ? "원천 해시 일치" : "원천 해시 불일치");
  return ok;
}

function makeBatches(level: Level, size: number) {
  const { ko } = loadKo();
  const overrides = existsSync(OVERRIDES_FILE) ? readJson<Record<string, Override>>(OVERRIDES_FILE) : {};
  const sources = loadSources();
  const droppedIds = new Set(buildLevels({ sources, ko: {}, overrides }).dropped.map((d) => d.id));
  const have = new Set([
    ...Object.keys(ko[level] ?? {}),
    ...Object.entries(overrides).filter(([, o]) => o.ko_primary).map(([id]) => id),
  ]);
  const todo = (sources[level] ?? [])
    .filter((e) => !have.has(e.id) && !droppedIds.has(e.id) && !overrides[e.id]?.exclude)
    .map(({ id, word, reading, meanings, pos }) => ({ id, word, reading, meanings, pos }));
  for (let i = 0; i < todo.length; i += size) {
    const path = join(BATCH_DIR, `${level}-${String(i / size + 1).padStart(3, "0")}.json`);
    writeJson(path, todo.slice(i, i + size));
    console.log(path);
  }
  console.log(`${level}: 뜻 없는 단어 ${todo.length}개 → ${Math.ceil(todo.length / size)}묶음`);
}

function build(allowPartial: boolean): boolean {
  const { ko, duplicates } = loadKo();
  const overrides = existsSync(OVERRIDES_FILE) ? readJson<Record<string, Override>>(OVERRIDES_FILE) : {};
  const sources = loadSources();
  const { out, problems, dropped, pronCandidates } = buildLevels({
    sources, ko, overrides, koDuplicates: duplicates, allowPartial,
  });

  if (dropped.length) console.log(`레벨 간 중복으로 위 레벨에서 뺀 단어 ${dropped.length}개`);
  if (pronCandidates.length) {
    console.log(`pron 후보(は/へ로 끝나는 읽기, overrides 에 pron 이 없음) ${pronCandidates.length}개:`);
    for (const c of pronCandidates) console.log(`  ${c.level} ${c.id} ${c.word} ${c.reading}`);
  }
  if (problems.length) {
    console.error(`문제 ${problems.length}개 — 아무것도 쓰지 않음`);
    for (const p of problems) console.error(`  [${p.kind}] ${p.level ?? "-"} ${p.id} ${p.word ?? ""} ${p.detail}`);
    return false;
  }

  const manifest: Record<string, { ready: boolean; kana: number; kanji: number }> = {};
  for (const level of LEVELS) {
    const list = out[level];
    manifest[level] = { ready: !!list, kana: list?.length ?? 0, kanji: list?.filter((e) => e.kanji).length ?? 0 };
    if (list) writeJson(join(OUT_DIR, `${level}.json`), list, false);
  }
  writeJson(join(OUT_DIR, "levels.json"), manifest);
  for (const [level, m] of Object.entries(manifest))
    console.log(`${level}: ${m.ready ? `가나 ${m.kana} · 한자 ${m.kanji}` : "준비 중"}`);
  return true;
}

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  if (cmd === "fetch") return fetchSources();
  if (cmd === "verify") return void (verifySources() || process.exit(1));
  if (cmd === "batch") {
    const level = rest[0] as Level;
    if (!LEVELS.includes(level)) throw new Error(`레벨을 지정하세요: ${LEVELS.join(" ")}`);
    return makeBatches(level, Number(rest[1] ?? 100));
  }
  if (cmd === "build") return void (build(rest.includes("--allow-partial")) || process.exit(1));
  console.error("사용법: npm run data -- fetch | verify | batch <level> [size] | build [--allow-partial]");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
