/**
 * src/web/chat/ChatHint.tsx
 * Подсказка у кнопки чата: «Есть вопрос? Напишите — оператор ответит здесь».
 *
 * Один раз на посетителя (localStorage), через HINT_DELAY_MS на сайте и только
 * после ответа на плашку cookie — чтобы два окна не появлялись разом. Прячется
 * сама через HINT_SHOW_MS, по крестику или при открытии чата. Рисуется только в
 * браузере после загрузки — на серверную версию страницы (SEO) не влияет.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { X } from '@/components/ui/icons'
import { getCookieConsent } from '@/web/seo'

const SEEN_KEY = 'chat_hint_seen'
const HINT_DELAY_MS = 10_000
const HINT_SHOW_MS = 12_000

function seen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1') } catch { /* приватный режим — просто не запомним */ }
}

export default function ChatHint({ chatOpen, onOpen, right, bottom }: {
  chatOpen: boolean
  onOpen: () => void
  right: number
  bottom: number
}) {
  const reduce = useReducedMotion()
  const [show, setShow] = useState(false)

  // Ждём HINT_DELAY_MS и ответа на cookie; проверяем раз в секунду
  useEffect(() => {
    if (seen()) return
    const startedAt = Date.now()
    const t = setInterval(() => {
      if (Date.now() - startedAt < HINT_DELAY_MS || getCookieConsent() === null) return
      clearInterval(t)
      markSeen()
      setShow(true)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), HINT_SHOW_MS)
    return () => clearTimeout(t)
  }, [show])

  useEffect(() => { if (chatOpen) setShow(false) }, [chatOpen])

  return (
    <AnimatePresence>
      {show && !chatOpen && (
        <m.div
          key="chat-hint"
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="flex items-start gap-1 rounded-2xl pl-3.5 pr-1.5 py-2.5 max-w-[240px]"
          style={{
            position: 'fixed', right, bottom, zIndex: 189,
            background: 'var(--bg3)', boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
            marginBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <button type="button" onClick={() => { setShow(false); onOpen() }} className="text-left text-[13px] leading-snug text-[var(--text)]">
            Есть вопрос? Напишите — оператор ответит здесь
          </button>
          <button
            type="button"
            onClick={() => setShow(false)}
            aria-label="Скрыть подсказку"
            className="shrink-0 w-6 h-6 -mt-0.5 flex items-center justify-center rounded-lg text-[var(--hint)] hover:text-[var(--text)]"
          >
            <X size={14} />
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
