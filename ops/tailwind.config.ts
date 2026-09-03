import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1600px" },
    },
    extend: {
      colors: {
        "ops-bg": "#06080f",
        "ops-panel": "#0b0f1a",
        "ops-card": "#0e1424",
        "ops-border": "#1a2337",
        "ops-cyan": "#00d4ff",
        "ops-green": "#00ff88",
        "ops-red": "#ff3366",
        "ops-amber": "#ffb020",
        "ops-violet": "#8b5cf6",
        "ops-text": "#c9d4e8",
        "ops-dim": "#5a6b85",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        sans: ["Cairo", "sans-serif"],
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        pulseglow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 8px rgba(0,212,255,0.6)" },
          "50%": { opacity: "0.6", boxShadow: "0 0 16px rgba(0,212,255,0.9)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.3" },
          "94%": { opacity: "1" },
          "96%": { opacity: "0.4" },
          "97%": { opacity: "1" },
        },
      },
      animation: {
        scan: "scan 2.5s linear infinite",
        pulseglow: "pulseglow 2s ease-in-out infinite",
        blink: "blink 1.2s step-end infinite",
        flicker: "flicker 3s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
