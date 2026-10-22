/**
 * src/web/chat/chatStore.ts
 * Состояние виджета чата сайта: открыт ли, развёрнут ли на весь экран и текст,
 * который нужно подставить в поле ввода (например, «Вопрос по заказу #…»).
 * Открыть чат из любого места: useChatWidget.getState().openChat({ prefill })
 */
import { create } from 'zustand'

interface ChatWidgetState {
  open: boolean
  expanded: boolean
  prefill: string
  openChat: (opts?: { prefill?: string; expanded?: boolean }) => void
  close: () => void
  toggleExpanded: () => void
  takePrefill: () => string
}

export const useChatWidget = create<ChatWidgetState>((set, get) => ({
  open: false,
  expanded: false,
  prefill: '',
  openChat: (opts) =>
    set((s) => ({
      open: true,
      expanded: opts?.expanded ?? s.expanded,
      prefill: opts?.prefill ?? s.prefill,
    })),
  close: () => set({ open: false }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  takePrefill: () => {
    const p = get().prefill
    if (p) set({ prefill: '' })
    return p
  },
}))

export const openChat = (opts?: { prefill?: string; expanded?: boolean }) =>
  useChatWidget.getState().openChat(opts)
