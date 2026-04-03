/**
 * src/hooks/useTelegram.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Центральный хук для работы с Telegram WebApp SDK.
 *
 * Предоставляет:
 *   - tg            — объект window.Telegram.WebApp
 *   - user          — данные пользователя из Telegram
 *   - initData      — строка для авторизации на бэкенде
 *   - colorScheme   — "light" | "dark" (для темизации)
 *   - showMainButton / hideMainButton — управление кнопкой внизу
 *   - showBackButton / hideBackButton
 *   - haptic         — тактильная отдача
 *   - close / expand / ready
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// Тип для window.Telegram.WebApp (упрощённый)
interface TelegramWebApp {
  ready: () => void
  expand: () => void
  close: () => void
  initData: string
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
      photo_url?: string
    }
    start_param?: string
  }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isActive: boolean
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    setText: (text: string) => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
  }
  BackButton: {
    isVisible: boolean
    show: () => void
    hide: () => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  openLink: (url: string) => void
  openTelegramLink: (url: string) => void
  showAlert: (message: string, callback?: () => void) => void
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

function getTg(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

export function useTelegram() {
  // Стабилизируем ссылку на объект WebApp через ref,
  // чтобы не вызывать useEffect при каждом рендере
  const tgRef = useRef<TelegramWebApp | null>(getTg())
  const tg = tgRef.current

  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(
    tg?.colorScheme ?? 'light'
  )

  useEffect(() => {
    if (!tg) return
    tg.ready()
    tg.expand()

    // Слушаем смену темы
    const handler = () => setColorScheme(tg.colorScheme)
    // Telegram не предоставляет стандартный event listener для темы,
    // поэтому периодически проверяем (или используем MutationObserver)
    const interval = setInterval(handler, 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Main Button ────────────────────────────────────────────────────────────
  const showMainButton = useCallback(
    (text: string, onClick: () => void, options?: { loading?: boolean }) => {
      if (!tg) return
      tg.MainButton.setText(text)
      tg.MainButton.onClick(onClick)
      if (options?.loading) {
        tg.MainButton.showProgress()
      } else {
        tg.MainButton.hideProgress()
      }
      tg.MainButton.show()
      tg.MainButton.enable()
    },
    [tg]
  )

  const hideMainButton = useCallback(
    (onClick?: () => void) => {
      if (!tg) return
      if (onClick) tg.MainButton.offClick(onClick)
      tg.MainButton.hide()
    },
    [tg]
  )

  const setMainButtonLoading = useCallback(
    (loading: boolean) => {
      if (!tg) return
      if (loading) {
        tg.MainButton.showProgress(true)
        tg.MainButton.disable()
      } else {
        tg.MainButton.hideProgress()
        tg.MainButton.enable()
      }
    },
    [tg]
  )

  // ── Back Button ────────────────────────────────────────────────────────────
  const showBackButton = useCallback(
    (onClick: () => void) => {
      if (!tg) return
      tg.BackButton.onClick(onClick)
      tg.BackButton.show()
    },
    [tg]
  )

  const hideBackButton = useCallback(
    (onClick?: () => void) => {
      if (!tg) return
      if (onClick) tg.BackButton.offClick(onClick)
      tg.BackButton.hide()
    },
    [tg]
  )

  // ── Haptics ────────────────────────────────────────────────────────────────
  const haptic = {
    impact: (style: 'light' | 'medium' | 'heavy' = 'light') =>
      tg?.HapticFeedback.impactOccurred(style),
    success: () => tg?.HapticFeedback.notificationOccurred('success'),
    error:   () => tg?.HapticFeedback.notificationOccurred('error'),
    warning: () => tg?.HapticFeedback.notificationOccurred('warning'),
    select:  () => tg?.HapticFeedback.selectionChanged(),
  }

  // ── Dialogs ────────────────────────────────────────────────────────────────
  const showConfirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        if (!tg) { resolve(window.confirm(message)); return }
        tg.showConfirm(message, resolve)
      }),
    [tg]
  )

  return {
    tg,
    user: tg?.initDataUnsafe?.user ?? null,
    initData: tg?.initData ?? '',
    startParam: tg?.initDataUnsafe?.start_param ?? null,
    colorScheme,
    isDark: colorScheme === 'dark',
    showMainButton,
    hideMainButton,
    setMainButtonLoading,
    showBackButton,
    hideBackButton,
    haptic,
    showConfirm,
    close: () => tg?.close(),
    openLink: (url: string) => tg?.openLink(url) ?? window.open(url, '_blank'),
  }
}
