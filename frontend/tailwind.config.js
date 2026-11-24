import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem" },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      colors: {
        canvas: "hsl(var(--canvas))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        line: "hsl(var(--line))",
        ink: { DEFAULT: "hsl(var(--ink))", 2: "hsl(var(--ink-2))", 3: "hsl(var(--ink-3))" },
        brand: { DEFAULT: "hsl(var(--brand))", fg: "hsl(var(--brand-fg))", soft: "hsl(var(--brand-soft))", ink: "hsl(var(--brand-ink))" },
        redline: { DEFAULT: "hsl(var(--redline))", soft: "hsl(var(--redline-soft))" },
        insert: { DEFAULT: "hsl(var(--insert))", soft: "hsl(var(--insert-soft))" },
        demo: { DEFAULT: "hsl(var(--demo))", soft: "hsl(var(--demo-soft))" },
        good: "hsl(var(--good))",
        warning: "hsl(var(--warning))",
        serious: "hsl(var(--serious))",
        critical: "hsl(var(--critical))",
        ring: "hsl(var(--brand))",
      },
      borderRadius: { lg: "10px", md: "7px", sm: "5px" },
      boxShadow: {
        pop: "0 12px 32px -8px hsl(220 40% 12% / 0.18), 0 2px 6px -2px hsl(220 40% 12% / 0.08)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "zoom-in": { from: { opacity: "0", transform: "scale(.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "grow-x": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
      },
      animation: {
        "fade-in": "fade-in .18s ease-out",
        "slide-in-right": "slide-in-right .26s cubic-bezier(.2,.8,.2,1)",
        "zoom-in": "zoom-in .18s ease-out",
        "grow-x": "grow-x .7s cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [animate],
};
