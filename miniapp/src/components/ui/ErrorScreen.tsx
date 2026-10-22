// src/components/ui/ErrorScreen.tsx
import { WifiOff } from 'lucide-react'

export default function ErrorScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--bg2)', color: 'var(--hint)' }}
      >
        <WifiOff size={28} strokeWidth={1.75} />
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Не удалось загрузить
        </h2>
        <p className="text-sm" style={{ color: 'var(--hint)' }}>
          Открой бота и попробуй снова
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98]"
        style={{ background: 'var(--accent)', color: '#fff', transition: 'transform 0.1s ease' }}
      >
        Попробовать снова
      </button>
    </div>
  )
}
