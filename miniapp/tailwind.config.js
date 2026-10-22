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
      // Иерархия скруглений (значения — в theme.css)
      borderRadius: {
        lg:    'var(--r-badge)',    // 6  — бейджи
        xl:    'var(--r-control)',  // 10 — кнопки, поля, обложки
        '2xl': 'var(--r-card)',     // 12 — карточки
        '3xl': 'var(--r-sheet)',    // 20 — шторки, модалки
      },
      fontFamily: {
        sans:    ['Onest Variable', 'system-ui', 'sans-serif'],
        display: ['Unbounded Variable', 'Onest Variable', 'sans-serif'],
      },
      scale: {
        '98': '0.98',
      },
    },
  },
  plugins: [],
}
