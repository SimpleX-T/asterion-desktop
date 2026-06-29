import type { Config } from "tailwindcss";

// Palette ported from asterion-ios/Utilities/Theme.swift (RGB floats -> hex).
// Reader text colors are theme-driven via CSS vars (see src/index.css) so the
// reader can switch between dark / light / sepia / warm without re-theming chrome.
const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // App chrome — driven by CSS vars so the whole app can switch themes
        // via [data-app-theme] (see src/index.css + ThemeProvider).
        asterion: {
          bg: "rgb(var(--app-bg) / <alpha-value>)",
          card: "rgb(var(--app-card) / <alpha-value>)",
          cardHover: "rgb(var(--app-card-hover) / <alpha-value>)",
          text: "rgb(var(--app-text) / <alpha-value>)",
          muted: "rgb(var(--app-muted) / <alpha-value>)",
          dim: "rgb(var(--app-dim) / <alpha-value>)",
          border: "rgb(var(--app-border) / <alpha-value>)",
          borderHover: "rgb(var(--app-border-hover) / <alpha-value>)",
          synopsis: "rgb(var(--app-synopsis) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--app-accent) / <alpha-value>)",
          soft: "rgb(var(--app-accent-soft) / <alpha-value>)",
        },
        // Reader surface/text resolve from CSS variables set per theme.
        reader: {
          bg: "rgb(var(--reader-bg) / <alpha-value>)",
          text: "rgb(var(--reader-text) / <alpha-value>)",
          muted: "rgb(var(--reader-muted) / <alpha-value>)",
          accent: "rgb(var(--reader-accent) / <alpha-value>)",
          border: "rgb(var(--reader-border) / <alpha-value>)",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "ui-serif", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
