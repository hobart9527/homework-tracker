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
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
export default config;
