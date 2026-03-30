/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Используем CSS-переменные Telegram для автоматической темизации
        tg: {
          bg:          'var(--tg-theme-bg-color, #ffffff)',
          secondary:   'var(--tg-theme-secondary-bg-color, #f1f1f1)',
          text:        'var(--tg-theme-text-color, #000000)',
          hint:        'var(--tg-theme-hint-color, #999999)',
          link:        'var(--tg-theme-link-color, #2481cc)',
          button:      'var(--tg-theme-button-color, #2481cc)',
          'button-text': 'var(--tg-theme-button-text-color, #ffffff)',
          accent:      'var(--tg-theme-accent-text-color, #2481cc)',
        },
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(20px)', opacity: '0' },
                   to:   { transform: 'translateY(0)',    opacity: '1' } },
      },
    },
  },
  plugins: [],
}
