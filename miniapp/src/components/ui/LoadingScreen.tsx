// src/components/ui/LoadingScreen.tsx
const SHOP_NAME = import.meta.env.VITE_SHOP_NAME || 'reDonate'

export default function LoadingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-6"
      style={{ background: 'var(--bg)' }}
    >
      {/* Ambient glow layers */}
      <div className="relative flex items-center justify-center">
        {/* Outer pulse rings */}
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              inset: `-${i * 14}px`,
              border: `1px solid rgba(45,88,173,${0.2 / i})`,
              animation: `glowPulse 2.4s ease-in-out ${i * 0.35}s infinite`,
            }}
          />
        ))}

        {/* Logo tile */}
        <div
          className="relative w-18 h-18 rounded-2xl flex items-center justify-center z-10"
          style={{
            width: 72,
            height: 72,
            background: 'linear-gradient(135deg, #2d58ad 0%, #1e3f8a 100%)',
            boxShadow: '0 0 32px rgba(45,88,173,0.6), 0 0 64px rgba(45,88,173,0.22)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="4" />
            <path d="M6 12h4M8 10v4" />
            <circle cx="15" cy="11" r="1.1" fill="white" stroke="none" />
            <circle cx="18" cy="13" r="1.1" fill="white" stroke="none" />
          </svg>
        </div>
      </div>

      {/* Shop name */}
      <p
        className="text-base font-bold tracking-tight"
        style={{
          background: 'linear-gradient(135deg, #ffffff, #93b8f0)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginTop: -8,
        }}
      >
        {SHOP_NAME}
      </p>

    </div>
  )
}
