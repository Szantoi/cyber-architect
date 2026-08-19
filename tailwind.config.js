/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--bg-main)",
        surface: "var(--surface-main)",
        "surface-container": "var(--surface-container)",
        "surface-container-lowest": "var(--surface-main)",
        "surface-container-low": "var(--surface-subtle)",
        "surface-container-high": "var(--surface-container-high)",
        "surface-container-highest": "var(--surface-container-highest)",
        "on-surface": "var(--text-main)",
        "on-background": "var(--text-main)",
        "border-main": "var(--border-main)",
        "border-subtle": "var(--border-subtle)",
        "text-muted": "var(--text-muted)",
        neonCyan: "var(--neon-cyan)",
        neonMagenta: "var(--neon-magenta)",
        plasmaGreen: "var(--plasma-green)",
        "secondary-fixed": "var(--neon-cyan)",
        "primary": "var(--neon-cyan)",
        "secondary": "var(--neon-magenta)",
        "tertiary": "var(--plasma-green)",
      },
      fontFamily: {
        headline: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "Plus Jakarta Sans", "sans-serif"],
        label: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        "space-grotesk": ["Space Grotesk", "sans-serif"]
      },
      borderRadius: {
        DEFAULT: "0rem",
        lg: "0rem",
        xl: "0rem",
        full: "9999px"
      },
    },
  },
  plugins: [],
}
