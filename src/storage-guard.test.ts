import { describe, expect, it } from "vitest";
import { type StorageEnv, homeNotice, isIos, needsExportReminder, requestPersist } from "./storage-guard";

const env = (o: Partial<StorageEnv> = {}): StorageEnv => ({ persist: "denied", ios: false, standalone: false, ...o });

describe("requestPersist", () => {
  it("이미 허락됐으면 다시 묻지 않는다", async () => {
    let asked = false;
    const s = { persisted: async () => true, persist: async () => ((asked = true), true) };
    expect(await requestPersist(s)).toBe("granted");
    expect(asked).toBe(false);
  });
  it("요청 결과 true/false", async () => {
    expect(await requestPersist({ persisted: async () => false, persist: async () => true })).toBe("granted");
    expect(await requestPersist({ persisted: async () => false, persist: async () => false })).toBe("denied");
  });
  it("API 가 없거나 던지면 미지원", async () => {
    expect(await requestPersist(undefined)).toBe("unsupported");
    expect(await requestPersist({})).toBe("unsupported");
    expect(await requestPersist({ persisted: async () => false, persist: async () => { throw new Error("x"); } })).toBe("unsupported");
  });
});

describe("isIos", () => {
  it("아이폰·아이패드(데스크톱 모드 포함)", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
  });
  it("맥·안드로이드는 아님", () => {
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 10; K)", "Linux armv8l", 5)).toBe(false);
  });
});

describe("homeNotice", () => {
  it("영구 저장이 허락되면 안내 없음, 거절·미지원이면 한 번", () => {
    expect(homeNotice(env({ persist: "granted" }), false, false)).toBeNull();
    expect(homeNotice(env({ persist: "denied" }), false, false)).toBe("persist");
    expect(homeNotice(env({ persist: "unsupported" }), true, false)).toBe("persist");
  });
  it("아이폰 Safari 는 허락 여부와 상관없이 설치 안내, 기록이 있으면 옮기는 안내", () => {
    expect(homeNotice(env({ ios: true, persist: "granted" }), false, false)).toBe("ios-install");
    expect(homeNotice(env({ ios: true, persist: "granted" }), true, false)).toBe("ios-move");
  });
  it("아이폰 홈 화면 앱은 설치 안내 대신 일반 규칙", () => {
    expect(homeNotice(env({ ios: true, standalone: true, persist: "granted" }), true, false)).toBeNull();
    expect(homeNotice(env({ ios: true, standalone: true, persist: "denied" }), true, false)).toBe("persist");
  });
  it("다시 보지 않기를 누르면 아무것도 없음", () => {
    expect(homeNotice(env({ ios: true }), false, true)).toBeNull();
    expect(homeNotice(env(), false, true)).toBeNull();
  });
});

describe("needsExportReminder", () => {
  const since = "2026-10-01T09:00:00.000Z";
  const at = (iso: string) => new Date(iso);
  it("7일 경계", () => {
    expect(needsExportReminder(env(), true, since, at("2026-10-08T08:59:59.999Z"))).toBe(false);
    expect(needsExportReminder(env(), true, since, at("2026-10-08T09:00:00.000Z"))).toBe(true);
  });
  it("영구 저장이 허락됐거나 기록이 없으면 권하지 않음", () => {
    const later = at("2026-11-01T00:00:00.000Z");
    expect(needsExportReminder(env({ persist: "granted" }), true, since, later)).toBe(false);
    expect(needsExportReminder(env(), false, since, later)).toBe(false);
    expect(needsExportReminder(env({ persist: "unsupported" }), true, since, later)).toBe(true);
  });
  it("기준 시각이 없으면 권하지 않고, 깨진 값이면 권한다", () => {
    expect(needsExportReminder(env(), true, null)).toBe(false);
    expect(needsExportReminder(env(), true, "garbage")).toBe(true);
  });
});
