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
        primary: {
          DEFAULT: "#56AB91",
          light: "#A8E6CF",
          dark: "#3D8B76",
        },
        accent: "#FF6B6B",
        background: "#F8FFF8",
        forest: {
          50: "#F8FFF8",
          100: "#E8FFF0",
          200: "#C8F5D8",
          300: "#A8E6CF",
          400: "#88D8B0",
          500: "#56AB91",
          600: "#3D8B76",
          700: "#2D6B5A",
          800: "#1F4D3F",
          900: "#143328",
        },
      },
      fontFamily: {
        sans: ["'Nunito'", "'PingFang SC'", "'Microsoft YaHei'", 'system-ui', '-apple-system', 'sans-serif'],
        display: ["'Nunito'", "'PingFang SC'", 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        "card": "1.75rem",
      },
    },
  },
  plugins: [],
};
module.exports = config;
