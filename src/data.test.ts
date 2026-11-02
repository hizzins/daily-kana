import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSentences } from "./data";

afterEach(() => vi.unstubAllGlobals());

describe("데이터 캐시", () => {
  it("실패한 요청은 캐시하지 않아 연결된 뒤 다시 받는다", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", fetch);
    await expect(loadSentences("n4")).rejects.toThrow("offline");
    await expect(loadSentences("n4")).resolves.toEqual([]);
    await loadSentences("n4");
    expect(fetch).toHaveBeenCalledTimes(2); // 성공한 뒤로는 캐시
  });
});
