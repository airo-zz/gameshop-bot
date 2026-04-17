// src/components/ui/LoadingScreen.tsx
import { useEffect, useState } from 'react'
import logo from '@/assets/logo.png'

const SHOP_NAME = import.meta.env.VITE_SHOP_NAME ?? 'reDonate'

export default function LoadingScreen({ exiting = false }: { exiting?: boolean }) {
  const [visible, setVisible] = useState(false)

  // Небольшая задержка перед появлением — чтобы не мигало при мгновенной загрузке
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg, #060f1e)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        opacity: exiting ? 0 : visible ? 1 : 0,
        transition: exiting ? 'opacity 0.35s ease' : 'opacity 0.25s ease',
        pointerEvents: exiting ? 'none' : 'auto',
      }}
    >
      <style>{`
        @keyframes splash-ring-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes splash-ring-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.06); }
        }
        @keyframes splash-logo-in {
          from { opacity: 0; transform: scale(0.78); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes splash-text-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
      `}</style>

      {/* Glow behind logo */}
      <div style={{
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.22) 0%, transparent 70%)',
        animation: 'splash-ring-pulse 2.4s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Spinning ring */}
      <div style={{
        position: 'absolute',
        width: 104,
        height: 104,
        borderRadius: '50%',
        border: '1.5px solid transparent',
        borderTopColor: 'rgba(96,165,250,0.7)',
        borderRightColor: 'rgba(96,165,250,0.2)',
        animation: 'splash-ring-spin 1.1s linear infinite',
        pointerEvents: 'none',
      }} />

      {/* Static outer ring */}
      <div style={{
        position: 'absolute',
        width: 104,
        height: 104,
        borderRadius: '50%',
        border: '1px solid rgba(37,99,235,0.18)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        width: 68,
        height: 68,
        borderRadius: 22,
        background: 'linear-gradient(135deg, rgba(30,58,138,0.9), rgba(29,78,216,0.85))',
        border: '1px solid rgba(96,165,250,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 32px rgba(29,78,216,0.4), 0 0 0 1px rgba(96,165,250,0.1)',
        animation: 'splash-logo-in 0.5s cubic-bezier(0.34,1.3,0.64,1) both',
        animationDelay: '0.1s',
      }}>
        <img src={logo} alt="" style={{ width: 42, height: 42, objectFit: 'contain' }} />
      </div>

      {/* Shop name + tagline */}
      <div style={{
        marginTop: 80,
        animation: 'splash-text-in 0.4s ease both',
        animationDelay: '0.3s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
          {SHOP_NAME}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          игровой донат
        </span>
      </div>

      {/* Dot loader */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
        display: 'flex',
        gap: 6,
        animation: 'splash-text-in 0.4s ease both',
        animationDelay: '0.5s',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(96,165,250,0.7)',
            animation: `splash-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}
