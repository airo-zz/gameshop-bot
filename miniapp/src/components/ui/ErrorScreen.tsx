// src/components/ui/ErrorScreen.tsx
export default function ErrorScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center"
      style={{ background: 'var(--bg)' }}
    >
      {/* Иконка с glow */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
        style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          boxShadow: '0 0 24px rgba(239,68,68,0.15)',
        }}
      >
        ⚠️
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          Не удалось загрузить
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--hint)' }}>
          Открой бота и попробуй ещё раз
        </p>
      </div>
    </div>
  )
}
