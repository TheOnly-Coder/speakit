/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        speakit: {
          bg: "#0e0e13",
          sidebar: "#14141b",
          rail: "#0a0a0e",
          card: "#17171f",
          input: "#1d1d28",
          blurple: "#6c6cf5",
          blurpleDark: "#4f4ede",
          accent: "#a78bfa",
          accentPink: "#f472b6",
          accentCyan: "#22d3ee",
          green: "#22c55a",
          text: "#eceaf2",
          muted: "#9a9ab0",
          border: "#26262f",
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
        glow: "0 0 0 1px rgb(108 108 245 / 0.35), 0 8px 32px -8px rgb(108 108 245 / 0.45)",
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
