// src/components/ui/LoadingScreen.tsx
import { motion } from 'framer-motion'
import logoSrc from '@/assets/logo.png'

interface LoadingScreenProps {
  exiting?: boolean
}

export default function LoadingScreen({ exiting = false }: LoadingScreenProps) {
  return (
    <motion.div
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#060f1e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        gap: 20,
      }}
    >
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.65, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(45,88,173,0.5), 0 0 80px rgba(45,88,173,0.2)',
        }}
      >
        <img
          src={logoSrc}
          alt="reDonate"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </motion.div>

      {/* Brand name */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35, ease: 'easeOut' }}
        style={{
          margin: 0,
          fontWeight: 800,
          fontSize: '1.9rem',
          letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #ffffff 0%, #93b8f0 60%, #6b9de8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        reDonate
      </motion.p>

      {/* Subtle glow line */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5, ease: 'easeOut' }}
        style={{
          width: 120,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(107,157,232,0.6), transparent)',
          transformOrigin: 'center',
        }}
      />
    </motion.div>
  )
}
