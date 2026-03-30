// src/components/ui/LoadingScreen.tsx
export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div
        className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
        style={{ borderColor: 'var(--bg2)', borderTopColor: 'var(--btn)' }}
      />
      <p style={{ color: 'var(--hint)' }} className="text-sm">Загрузка...</p>
    </div>
  )
}
