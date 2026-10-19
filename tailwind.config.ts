/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        speakit: {
          // CSS-var driven surfaces: opacity modifiers (e.g. bg-speakit-rail/95)
          // keep working in both dark and light mode automatically.
          bg: "rgb(var(--sp-bg) / <alpha-value>)",
          sidebar: "rgb(var(--sp-sidebar) / <alpha-value>)",
          rail: "rgb(var(--sp-rail) / <alpha-value>)",
          card: "rgb(var(--sp-card) / <alpha-value>)",
          input: "rgb(var(--sp-input) / <alpha-value>)",
          text: "rgb(var(--sp-text) / <alpha-value>)",
          muted: "rgb(var(--sp-muted) / <alpha-value>)",
          border: "rgb(var(--sp-border) / <alpha-value>)",
          blurple: "#5865f2",
          blurpleDark: "#4752c4",
          accent: "rgb(var(--sp-accent) / <alpha-value>)",
          accentPink: "#f472b6",
          accentCyan: "#22d3ee",
          green: "#22c55a",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "gg sans",
          "Noto Sans",
          "Whitney",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(88 101 242 / 0.35)",
        pop: "0 12px 40px -12px rgb(0 0 0 / 0.7), 0 2px 8px rgb(0 0 0 / 0.4)",
        card: "0 4px 24px -6px rgb(0 0 0 / 0.5)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms ease-out both",
      },
    },
  },
  plugins: [],
};
