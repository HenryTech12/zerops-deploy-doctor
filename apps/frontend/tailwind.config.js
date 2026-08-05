/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#14181C",
        panel: "#1C2228",
        inset: "#171B20",
        text: {
          primary: "#E8ECEF",
          secondary: "#8A96A3",
          muted: "#5C6670",
        },
        coral: "#F0665A",
        teal: "#4FD1A5",
        amber: "#E8B94F",
        aiblue: "#7C9FF2",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
