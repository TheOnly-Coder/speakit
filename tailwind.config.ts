/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        speakit: {
          bg: "#313338",
          sidebar: "#2b2d31",
          rail: "#1e1f22",
          card: "#2b2d31",
          input: "#383a40",
          blurple: "#5865f2",
          green: "#23a55a",
          text: "#dbdee1",
          muted: "#949ba4",
        },
      },
    },
  },
  plugins: [],
};
