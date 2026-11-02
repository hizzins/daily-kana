import { defineConfig } from "@playwright/test";

// 설치된 Chrome 을 쓴다(브라우저 별도 다운로드 없음). 빌드 산출물(dist)을 Pages 와 같은 하위 경로로 띄워 SW·오프라인까지 본다.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    channel: "chrome",
    baseURL: "http://127.0.0.1:8093/daily-kana/",
    locale: "ko-KR",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npx vite preview --base /daily-kana/ --port 8093 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:8093/daily-kana/",
    reuseExistingServer: false,
  },
});
