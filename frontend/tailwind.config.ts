import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pitch: {
          slate: "#0B1117",
          surface: "#121A24",
          elevated: "#182230",
          border: "rgba(148, 163, 184, 0.16)",
        },
        floodlight: "#10B981",
        gold: "#F59E0B",
        crimson: "#EF4444",
        chalk: "#F1F5F9",
        steel: "#94A3B8",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
