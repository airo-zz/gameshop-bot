// src/components/ui/ErrorScreen.tsx
export default function ErrorScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
      >
        😔
      </div>
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>
          Не удалось загрузить
        </h2>
        <p className="text-sm" style={{ color: 'var(--hint)' }}>
          Открой бота и попробуй снова
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
        style={{
          background: 'rgba(124,58,237,0.15)',
          border: '1px solid rgba(124,58,237,0.35)',
          color: '#a78bfa',
        }}
      >
        Попробовать снова
      </button>
    </div>
  )
}
