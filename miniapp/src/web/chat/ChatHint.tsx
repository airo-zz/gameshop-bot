/**
 * src/web/chat/ChatHint.tsx
 * Приветствие оператора у кнопки чата — как в виджетах JivoSite/Intercom:
 * карточка «Оператор reDonate · в сети» с текстом и кнопкой «Написать»,
 * красный счётчик «1» на кнопке (пульсирует 3 раза) и короткий тихий звук.
 *
 * Правила, чтобы не раздражать:
 *  • пока человек ни разу не открывал чат (DONE_KEY), не чаще раза за визит (SESSION_KEY);
 *  • через GREET_DELAY_MS и только после ответа на плашку cookie — два окна разом не всплывают;
 *  • карточка прячется сама через GREET_SHOW_MS (счётчик остаётся до конца визита
 *    или до открытия чата), по крестику, при открытии чата;
 *  • звук — только если человек уже кликал по странице (иначе браузер его и не даст)
 *    и не просил «меньше движения».
 * Рисуется только в браузере после загрузки — на серверную версию страниц (SEO) не влияет.
 */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { X } from '@/components/ui/icons'
import { getCookieConsent } from '@/web/seo'
import logoMark from '@/assets/logo-mark.png'

const DONE_KEY = 'chat_greeting_done'
const SESSION_KEY = 'chat_greeting_session'
const GREET_DELAY_MS = 6_000
const GREET_SHOW_MS = 25_000

function get(store: 'local' | 'session', key: string): string | null {
  try { return (store === 'local' ? localStorage : sessionStorage).getItem(key) } catch { return '1' }
}
function put(store: 'local' | 'session', key: string) {
  try { (store === 'local' ? localStorage : sessionStorage).setItem(key, '1') } catch { /* приватный режим */ }
}

/** Короткий мягкий «дзынь» без файла — синтез WebAudio, громкость низкая */
function chime() {
  try {
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ctx.resume().catch(() => undefined)
    const now = ctx.currentTime
    for (const [freq, at] of [[880, 0], [1320, 0.12]] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + at)
      gain.gain.linearRampToValueAtTime(0.06, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.4)
    }
    setTimeout(() => ctx.close().catch(() => undefined), 900)
  } catch { /* звук не обязателен */ }
}

/** Состояние приветствия: card — карточка на экране, badge — красная «1» на кнопке */
export function useChatGreeting(chatOpen: boolean) {
  const reduce = useReducedMotion()
  const [card, setCard] = useState(false)
  const [badge, setBadge] = useState(false)

  useEffect(() => {
    if (get('local', DONE_KEY) || get('session', SESSION_KEY)) return
    const startedAt = Date.now()
    const t = setInterval(() => {
      if (Date.now() - startedAt < GREET_DELAY_MS || getCookieConsent() === null) return
      clearInterval(t)
      put('session', SESSION_KEY)
      setCard(true)
      setBadge(true)
      if (!reduce) chime()
    }, 1000)
    return () => clearInterval(t)
  }, [reduce])

  useEffect(() => {
    if (!card) return
    const t = setTimeout(() => setCard(false), GREET_SHOW_MS)
    return () => clearTimeout(t)
  }, [card])

  // Открыл чат — больше не здороваемся
  useEffect(() => {
    if (!chatOpen) return
    put('local', DONE_KEY)
    setCard(false)
    setBadge(false)
  }, [chatOpen])

  const dismiss = useCallback(() => setCard(false), [])
  return { card: card && !chatOpen, badge: badge && !chatOpen, dismiss }
}

export default function ChatHint({ show, onOpen, onDismiss, right, bottom, mobile }: {
  show: boolean
  onOpen: () => void
  onDismiss: () => void
  right: number
  bottom: number
  mobile: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {show && (
        <m.div
          key="chat-greeting"
          role="dialog"
          aria-label="Сообщение от оператора"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl p-4"
          style={{
            position: 'fixed', right, bottom, zIndex: 189,
            width: mobile ? `calc(100vw - ${right * 2}px)` : 320, maxWidth: 340,
            background: 'var(--bg2)', boxShadow: '0 18px 44px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
            marginBottom: 'env(safe-area-inset-bottom, 0px)', transformOrigin: 'bottom right',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                <img src={logoMark} alt="" className="w-[22px] h-[22px] object-contain" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 0 2px var(--bg2)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text)] leading-tight">Оператор reDonate</p>
              <p className="text-xs text-[#4ade80] mt-0.5">в сети</p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Скрыть сообщение"
              className="shrink-0 w-8 h-8 -mr-1 -mt-1 self-start flex items-center justify-center rounded-lg text-[var(--hint)] hover:text-[var(--text)] hover:bg-[var(--bg3)]"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-[14px] leading-relaxed text-[var(--text)] mt-3">
            Здравствуйте! Если есть вопрос по товару, заказу или оплате — напишите, ответим здесь.
          </p>
          <button
            type="button"
            onClick={onOpen}
            className="mt-3.5 w-full h-10 rounded-xl text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
          >
            Написать
          </button>
        </m.div>
      )}
    </AnimatePresence>
  )
}
