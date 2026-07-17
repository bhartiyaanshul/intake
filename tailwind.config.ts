import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Ledger precision" palette — see README design notes.
        paper: "#F6F7F4",
        ink: "#15211B",
        ledger: "#1E6E4A", // primary actions, confirmed states
        amber: "#B45309", // verify flags
        danger: "#B3261E", // validation errors
        hairline: "#DDE2DB",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
