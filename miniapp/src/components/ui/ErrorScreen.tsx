// src/components/ui/ErrorScreen.tsx
export default function ErrorScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
      <span className="text-5xl">😔</span>
      <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
        Не удалось загрузить
      </h2>
      <p style={{ color: 'var(--hint)' }} className="text-sm">
        Открой бота и попробуй снова
      </p>
    </div>
  )
}
