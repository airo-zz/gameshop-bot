/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Геймерская тёмная палитра
        game: {
          bg:        '#0a0a0f',
          card:      '#13131a',
          border:    '#1e1e2e',
          primary:   '#6366f1',
          glow:      '#818cf8',
          text:      '#f1f5f9',
          muted:     '#94a3b8',
          success:   '#22c55e',
          danger:    '#ef4444',
          warn:      '#f59e0b',
          overlay:   'rgba(10,10,15,0.8)',
        },
        // Telegram CSS-переменные (fallback)
        tg: {
          bg:          'var(--tg-theme-bg-color, #0a0a0f)',
          secondary:   'var(--tg-theme-secondary-bg-color, #13131a)',
          text:        'var(--tg-theme-text-color, #f1f5f9)',
          hint:        'var(--tg-theme-hint-color, #94a3b8)',
          link:        'var(--tg-theme-link-color, #6366f1)',
          button:      'var(--tg-theme-button-color, #6366f1)',
          'button-text': 'var(--tg-theme-button-text-color, #ffffff)',
          accent:      'var(--tg-theme-accent-text-color, #6366f1)',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #6366f1, #7c3aed)',
        'gradient-glow':    'linear-gradient(135deg, #818cf8, #6366f1)',
        'gradient-card':    'linear-gradient(180deg, #13131a, #0f0f18)',
      },
      boxShadow: {
        'glow-sm':  '0 0 12px rgba(99,102,241,0.25)',
        'glow':     '0 0 20px rgba(99,102,241,0.35)',
        'glow-lg':  '0 0 32px rgba(99,102,241,0.45)',
        'card':     '0 2px 16px rgba(0,0,0,0.4)',
        'card-hover': '0 4px 24px rgba(99,102,241,0.15)',
      },
      animation: {
        'fade-in':     'fadeIn 0.2s ease-out',
        'slide-up':    'slideUp 0.25s ease-out',
        'pulse-soft':  'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':     'shimmer 1.8s infinite linear',
        'glow-pulse':  'glowPulse 2.5s ease-in-out infinite',
        'spin-slow':   'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(99,102,241,0.25)' },
          '50%':      { boxShadow: '0 0 28px rgba(99,102,241,0.5)' },
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
