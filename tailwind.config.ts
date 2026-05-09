import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── Color System ──────────────────────────────────────────────
      colors: {
        // Primary — Forest
        forest: {
          50: "#F4F9F5",
          100: "#E5F0E8",
          200: "#CADFD0",
          300: "#A8C7B0",
          400: "#7FA88A",
          500: "#56AB91",
          600: "#3D8B76",
          700: "#2D6B5A",
          800: "#1F4D3F",
          900: "#143328",
          950: "#0A1B14",
        },
        // Secondary — Cream (paper feel)
        cream: {
          50: "#FDFCF8",
          100: "#FAF6EC",
          200: "#F1E8D2",
          300: "#E5D4AB",
          400: "#D2BB85",
          500: "#B8A067",
        },
        // Accent — Coral (warm, encouraging)
        coral: {
          50: "#FFF4F0",
          100: "#FFE5DA",
          200: "#FFC9B3",
          300: "#FFA688",
          400: "#FF8259",
          500: "#F26033",
          600: "#D54A1F",
          700: "#A53814",
        },
        // Achievement — Honey
        honey: {
          50: "#FFFAEB",
          100: "#FFF1C7",
          200: "#FFE08A",
          300: "#FFCC4D",
          400: "#F5B41A",
          500: "#D69200",
        },
        // Neutral — Ink (replaces slate/gray/stone)
        ink: {
          50: "#F8F9FA",
          100: "#F1F3F4",
          200: "#E8EAED",
          300: "#DADCE0",
          400: "#9AA0A6",
          500: "#80868B",
          600: "#5F6368",
          700: "#3C4043",
          800: "#202124",
          900: "#171717",
        },
        // ── Legacy aliases (backward compatible) ──
        primary: {
          DEFAULT: "#56AB91",
          light: "#A8E6CF",
          dark: "#3D8B76",
        },
        accent: "#FF6B6B",
        background: "#F8FFF8",
      },

      // ── Font Families ─────────────────────────────────────────────
      fontFamily: {
        ui: [
          "'Inter'",
          "'Source Han Sans SC'",
          "'PingFang SC'",
          "'Microsoft YaHei'",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        "ui-display": [
          "'Inter Tight'",
          "'Source Han Sans SC'",
          "sans-serif",
        ],
        "reading-zh": [
          "'LXGW WenKai'",
          "'PingFang SC'",
          "serif",
        ],
        "reading-en": [
          "'Fraunces'",
          "'Inter'",
          "serif",
        ],
        // Legacy aliases
        sans: [
          "'Inter'",
          "'Source Han Sans SC'",
          "'PingFang SC'",
          "'Microsoft YaHei'",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        display: [
          "'Inter Tight'",
          "'Source Han Sans SC'",
          "sans-serif",
        ],
      },

      // ── Font Size — UI Scale ──────────────────────────────────────
      fontSize: {
        // UI scale (with letterSpacing)
        "ui-xs": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
        "ui-sm": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "0.005em" }],
        "ui-base": ["1rem", { lineHeight: "1.5rem", letterSpacing: "0" }],
        "ui-lg": ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.005em" }],
        "ui-xl": ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        "ui-2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }],
        "ui-3xl": ["1.875rem", { lineHeight: "2.375rem", letterSpacing: "-0.02em" }],
        "ui-4xl": ["2.25rem", { lineHeight: "2.75rem", letterSpacing: "-0.025em" }],
        "ui-5xl": ["3rem", { lineHeight: "3.5rem", letterSpacing: "-0.03em" }],
        // Reader scale
        "reader-xs": ["1rem", { lineHeight: "1.875rem" }],
        "reader-sm": ["1.125rem", { lineHeight: "2.125rem" }],
        "reader-md": ["1.25rem", { lineHeight: "2.375rem" }],
        "reader-lg": ["1.375rem", { lineHeight: "2.625rem" }],
        "reader-xl": ["1.5rem", { lineHeight: "2.875rem" }],
        // Legacy aliases
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1" }],
      },

      // ── Border Radius ─────────────────────────────────────────────
      borderRadius: {
        "radius-sm": "8px",
        "radius-md": "12px",
        "radius-lg": "18px",
        "radius-xl": "24px",
        "radius-2xl": "32px",
        // Legacy aliases
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        card: "1.75rem",
      },

      // ── Spacing ───────────────────────────────────────────────────
      spacing: {
        "space-1": "4px",
        "space-2": "8px",
        "space-3": "12px",
        "space-4": "16px",
        "space-5": "20px",
        "space-6": "24px",
        "space-8": "32px",
        "space-10": "40px",
        "space-12": "48px",
        "space-16": "64px",
        "space-20": "80px",
      },

      // ── Box Shadow / Elevation ────────────────────────────────────
      boxShadow: {
        "elevation-raised": "0 1px 2px rgba(10,27,20,0.04)",
        "elevation-floating": "0 8px 24px rgba(10,27,20,0.08), 0 0 0 1px rgba(232,234,237,0.5)",
        "elevation-modal": "0 24px 48px rgba(10,27,20,0.12)",
        parchment: "0 1px 0 rgba(0,0,0,0.04) inset, 0 -1px 0 rgba(0,0,0,0.04) inset, 0 0 32px rgba(0,0,0,0.06)",
      },

      // ── Transition Duration ───────────────────────────────────────
      transitionDuration: {
        fast: "150ms",
        med: "220ms",
        slow: "360ms",
        ritual: "600ms",
      },

      // ── Transition Timing Function ────────────────────────────────
      transitionTimingFunction: {
        "ease-out-custom": "cubic-bezier(.16, 1, .3, 1)",
        "ease-in-out-custom": "cubic-bezier(.65, 0, .35, 1)",
        bounce: "cubic-bezier(.34, 1.56, .64, 1)",
      },

      // ── Keyframe Animations ───────────────────────────────────────
      keyframes: {
        "hover-lift": {
          "0%": { transform: "translateY(0)", boxShadow: "0 1px 2px rgba(10,27,20,0.04)" },
          "100%": { transform: "translateY(-2px)", boxShadow: "0 8px 24px rgba(10,27,20,0.08), 0 0 0 1px rgba(232,234,237,0.5)" },
        },
        "card-active": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(0.98)" },
        },
        "stamp-reveal": {
          "0%": { transform: "scale(0.5) rotate(-12deg)", opacity: "0" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "page-turn": {
          "0%": { transform: "perspective(1000px) rotateY(0deg)" },
          "100%": { transform: "perspective(1000px) rotateY(-180deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "star-burst": {
          "0%": { transform: "scale(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "scale(2) rotate(180deg)", opacity: "0" },
        },
        "float-up": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-50px)", opacity: "0" },
        },
      },
      animation: {
        "hover-lift": "hover-lift 150ms cubic-bezier(.16, 1, .3, 1) forwards",
        "card-active": "card-active 150ms cubic-bezier(.16, 1, .3, 1) forwards",
        "stamp-reveal": "stamp-reveal 360ms cubic-bezier(.34, 1.56, .64, 1) forwards",
        "page-turn": "page-turn 600ms cubic-bezier(.65, 0, .35, 1) forwards",
        shimmer: "shimmer 2s linear infinite",
        "star-burst": "star-burst 0.6s ease-out forwards",
        "float-up": "float-up 1s ease-out forwards",
      },
    },
  },
  plugins: [],
};

module.exports = config;
