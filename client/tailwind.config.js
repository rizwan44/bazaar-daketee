/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#0b3d2e',
          light: '#12503d',
          dark: '#082a20',
        },
        gold: {
          DEFAULT: '#d4af37',
          light: '#e6c565',
        },
        card: {
          face: '#fdfbf5',
          back: '#0f2e4d',
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 4px rgba(0,0,0,0.25), 0 6px 14px rgba(0,0,0,0.2)',
        'card-lifted': '0 8px 20px rgba(0,0,0,0.35)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
};
