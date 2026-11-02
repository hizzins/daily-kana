import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// 상대 경로로 빌드해 GitHub Pages 하위 경로(/daily-kana/)에서도 그대로 동작하게 한다.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // 새 배포는 다음에 열 때 조용히 바뀐다(기록은 IndexedDB 라 영향 없음)
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "daily-kana",
        short_name: "daily-kana",
        description: "일본어 단어·문장을 보고 한글 발음과 한국어 뜻을 입력하면 바로 채점하는 읽기 연습",
        lang: "ko",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#fafafa",
        theme_color: "#fafafa",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // 앱 셸만 미리 받고, 단어·문장 데이터는 열어 본 레벨만 캐시한다(네트워크 우선, 끊기면 캐시).
        globPatterns: ["**/*.{js,css,html,png}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/data\/[^/]+\.json$/.test(url.pathname),
            handler: "NetworkFirst",
            options: { cacheName: "daily-kana-data", networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
});
