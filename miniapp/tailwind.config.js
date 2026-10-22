/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Значения бренда живут в src/theme.css (CSS-переменные)
      colors: {
        brand: {
          bg:     'var(--bg)',
          card:   'var(--bg2)',
          field:  'var(--bg3)',
          accent: 'var(--accent)',
          link:   'var(--link)',
          text:   'var(--text)',
          hint:   'var(--hint)',
        },
      },
      borderRadius: {
        '3xl': '1.5rem',
      },
      scale: {
        '98': '0.98',
      },
    },
  },
  plugins: [],
}
