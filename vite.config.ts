import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 상대 경로로 빌드해 GitHub Pages 하위 경로(/daily-kana/)에서도 그대로 동작하게 한다.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
