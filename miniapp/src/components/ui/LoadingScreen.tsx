// src/components/ui/LoadingScreen.tsx
import { motion } from 'framer-motion'
import logoSrc from '@/assets/logo.svg'
import logoTextSrc from '@/assets/logo-text.png'

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
          filter: 'drop-shadow(0 0 20px rgba(45,88,173,0.7)) drop-shadow(0 0 40px rgba(45,88,173,0.35))',
        }}
      >
        <img
          src={logoSrc}
          alt="reDonate"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </motion.div>

      {/* Brand name — PNG, transparent background */}
      <motion.img
        src={logoTextSrc}
        alt="reDonate"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.45, ease: 'easeOut' }}
        style={{ height: 36, width: 'auto', display: 'block', background: 'none' }}
      />

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
