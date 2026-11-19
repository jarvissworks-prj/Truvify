/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#FAFAFA",
        hairline: "#EAEAEA",
        primary: "#0A0A0A",
        "on-surface": "#1A1A1A",
        verified: "#10B981",
        disputed: "#F59E0B",
        retracted: "#EF4444",
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 8px 24px rgba(0,0,0,0.06)",
        lift: "0 12px 30px rgba(0,0,0,0.04)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0) rotate(var(--rot,0deg))" },
          "50%": { transform: "translateY(-9px) rotate(var(--rot,0deg))" },
        },
        pulsering: {
          "0%": { boxShadow: "0 0 0 0 rgba(10,10,10,0.35)" },
          "100%": { boxShadow: "0 0 0 14px rgba(10,10,10,0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.65s cubic-bezier(0.16,1,0.3,1) forwards",
        float: "float var(--dur,7s) ease-in-out infinite",
        pulsering: "pulsering 0.9s ease-out 2",
      },
    },
  },
  plugins: [],
};
