// src/components/ui/LoadingScreen.tsx
export default function LoadingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5"
      style={{ background: 'var(--bg)' }}
    >
      {/* Геймерский спиннер с двойным кольцом */}
      <div className="relative w-16 h-16">
        {/* Внешнее кольцо */}
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
          style={{
            borderTopColor: '#6366f1',
            borderRightColor: 'rgba(99,102,241,0.3)',
            animationDuration: '1s',
          }}
        />
        {/* Внутреннее кольцо (обратное вращение) */}
        <div
          className="absolute inset-2 rounded-full border-2 border-transparent"
          style={{
            borderBottomColor: '#818cf8',
            borderLeftColor: 'rgba(129,140,248,0.3)',
            animation: 'spin 1.5s linear infinite reverse',
          }}
        />
        {/* Центральный пульсирующий dot */}
        <div
          className="absolute inset-[22px] rounded-full animate-pulse"
          style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}
        />
      </div>

      <div className="text-center">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--hint)' }}
        >
          Загрузка...
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: 'rgba(148,163,184,0.5)' }}
        >
          redonate.su
        </p>
      </div>
    </div>
  )
}
