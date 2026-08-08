import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/chat/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      // مدخل البناء: entry.html (لأن index.html في الجذر هو نسخة البناء الجاهزة
      // للعرض على GitHub Pages مباشرة، وليست مدخل المصدر).
      input: { index: path.resolve(__dirname, "entry.html") },
    },
  },
});
