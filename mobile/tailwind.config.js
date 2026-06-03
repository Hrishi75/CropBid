/** @type {import('tailwindcss').Config} */
// Theme mirrors the web client's palette (client/src/index.css @theme block)
// so the mobile app reads as the same product. Dark mode added later.
module.exports = {
  content: [
    './App.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Primary — forest (deep agricultural green)
        primary: { DEFAULT: '#1f2d18', light: '#2d3b22', dark: '#14140f' },
        // Accent — sage
        accent: { DEFAULT: '#6b8e4e', light: '#8ba869', dark: '#4d6638' },
        // Surfaces — cream paper, not pure white
        surface: { DEFAULT: '#fbf9f3', alt: '#f4f1ea', hover: '#efece3' },
        // Text — warm ink
        ink: { DEFAULT: '#14140f', 2: '#4a4a3f', 3: '#82806f', inverse: '#f4f1ea' },
        // Borders
        border: { DEFAULT: '#d8d4c8', light: '#e8e4d6' },
        // Status
        success: '#6b8e4e',
        warning: '#c9b27a',
        error: '#c8602b',
        info: '#4a6580',
        // Brand palette extensions (bg-forest, text-ember, etc.)
        forest: { DEFAULT: '#1f2d18', 2: '#2d3b22' },
        sage: { DEFAULT: '#6b8e4e', 2: '#8ba869' },
        wheat: { DEFAULT: '#c9b27a', 2: '#e0cf9e' },
        ember: { DEFAULT: '#c8602b', 2: '#e07a3f' },
        paper: { DEFAULT: '#fbf9f3', 2: '#efece3' },
      },
    },
  },
  plugins: [],
};
