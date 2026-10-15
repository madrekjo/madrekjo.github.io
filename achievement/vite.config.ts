import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// ============================================================
// إضافة تطوير فقط: فتح أي مسار تحت /achievement/ مباشرةً يعرض
// مدخل التطوير entry.html (بدل index.html المبني الجاهز للنشر)،
// حتى تعمل المسارات مثل /achievement/preview و /achievement/dashboard
// محلياً بنفس سلوك الموقع المنشور. لا تأثير على البناء (apply: serve).
// ============================================================
function devSpaEntry(): Plugin {
  return {
    name: "dev-spa-entry",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, _res, next) => {
        const [pathname] = (req.url || "").split("?");
        const accept = String(req.headers.accept || "");
        const isAssetOrInternal = /^\/(?:achievement\/)?(?:@|src\/|node_modules\/|\.vite\/|assets\/)/.test(
          pathname,
        );
        const hasFileExt = /\.[a-zA-Z0-9]+$/.test(pathname);
        if (accept.includes("text/html") && !isAssetOrInternal && !hasFileExt) {
          req.url = "/achievement/entry.html";
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "/achievement/",
  server: {
    host: "::",
    port: 5000,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    host: "::",
    port: 5000,
  },
  plugins: [react(), devSpaEntry()],
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
