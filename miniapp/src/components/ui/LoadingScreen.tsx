// src/components/ui/LoadingScreen.tsx
// Полноэкранная заглушка (сейчас — только проверка доступа в админке).
// Выглядит так же, как стартовый сплэш из index.html. Только CSS-анимация.
import logoSrc from '@/assets/logo-icon.png'
import logoTextSrc from '@/assets/logo-full.png'

export default function LoadingScreen() {
  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        gap: 20,
      }}
    >
      <img src={logoSrc} alt="reDonate" style={{ width: 72, height: 72, borderRadius: 18, display: 'block' }} />
      <img src={logoTextSrc} alt="" style={{ height: 26, width: 'auto', display: 'block' }} />
    </div>
  )
}
