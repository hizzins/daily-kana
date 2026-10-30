// 기록 보존 안내(D5·D18). 판단은 순수 함수로 두고, 브라우저 값 읽기는 detectStorage 한 곳에서 한다.

export type Persist = "granted" | "denied" | "unsupported";

export interface StorageEnv {
  persist: Persist;
  ios: boolean;
  standalone: boolean; // 홈 화면에 설치한 앱으로 열림
}

/** 영구 저장을 요청한다. 이미 허락됐으면 다시 묻지 않는다. API가 없거나 던지면 거절과 같게 다루지 않고 "unsupported". */
export async function requestPersist(storage: Partial<StorageManager> | undefined): Promise<Persist> {
  if (!storage?.persist || !storage.persisted) return "unsupported";
  try {
    if (await storage.persisted()) return "granted";
    return (await storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** iPadOS 는 데스크톱 Safari 처럼 MacIntel 로 오므로 터치 지점 수로 가른다. */
export const isIos = (ua: string, platform: string, maxTouchPoints: number) =>
  /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);

export async function detectStorage(): Promise<StorageEnv> {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    persist: await requestPersist(nav.storage),
    ios: isIos(nav.userAgent, nav.platform, nav.maxTouchPoints),
    standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
  };
}

export type Notice = "ios-install" | "ios-move" | "persist";

/**
 * 홈 화면 안내. 아이폰 Safari 는 홈 화면 앱과 저장소가 따로라 영구 저장 여부와 상관없이 공부 전에 설치를 권하고,
 * 이미 기록이 있으면 옮기는 순서를 알려 준다(D18). 그 밖에는 영구 저장이 허락되지 않았을 때만 한 번(D5).
 */
export function homeNotice(env: StorageEnv, hasRecords: boolean, dismissed: boolean): Notice | null {
  if (dismissed) return null;
  if (env.ios && !env.standalone) return hasRecords ? "ios-move" : "ios-install";
  return env.persist === "granted" ? null : "persist";
}

export const EXPORT_REMIND_DAYS = 7;

/** 통계 화면 내보내기 권유: 영구 저장이 아니고 기록이 있는데, 마지막 내보내기(없으면 처음 연 날)부터 7일이 지났을 때. */
export function needsExportReminder(env: StorageEnv, hasRecords: boolean, since: string | null, now: Date = new Date()) {
  if (env.persist === "granted" || !hasRecords || !since) return false;
  const t = Date.parse(since);
  return Number.isNaN(t) || now.getTime() - t >= EXPORT_REMIND_DAYS * 86_400_000;
}
