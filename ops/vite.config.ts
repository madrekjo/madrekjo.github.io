import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const SECRET_BASE = "/k7-x9mz4-ops/";

export default defineConfig({
  base: SECRET_BASE,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8081,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
