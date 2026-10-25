/**
 * src/components/decor/useOptimisticQty.ts
 * Количество в корзине меняется на экране сразу, запрос уходит в фоне.
 *
 * Пока запрос не завершён, на экране — «целевое» количество (override). Клики по
 * одному товару копятся (DEBOUNCE_MS) и уходят ОДНИМ запросом с итоговым
 * количеством; запросы по одному товару идут строго по очереди. После ответа
 * корзина перечитывается; override снимается, только если пользователь не
 * кликнул ещё раз, — серверное значение к этому моменту совпадает с целью,
 * поэтому ничего не мигает. Ошибка — override снимается, значение возвращается
 * к серверному (обёртка показывает сообщение).
 */

import { useCallback, useMemo, useRef, useState } from 'react'

const DEBOUNCE_MS = 250

export function useOptimisticQty(
  server: Map<string, number>,
  commit: (id: string, target: number) => Promise<void>,
  settle: () => Promise<unknown>,
  onError: (e: unknown) => void,
) {
  const [override, setOverride] = useState<Map<string, number>>(new Map())
  const overrideRef = useRef(override)
  overrideRef.current = override
  const serverRef = useRef(server)
  serverRef.current = server
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const busy = useRef(new Set<string>())
  const again = useRef(new Set<string>())

  const qty = useMemo(() => {
    const m = new Map(server)
    override.forEach((v, id) => m.set(id, v))
    return m
  }, [server, override])

  const flush = useCallback(async (id: string) => {
    timers.current.delete(id)
    if (busy.current.has(id)) { again.current.add(id); return }
    const target = overrideRef.current.get(id)
    if (target === undefined) return
    if (target === (serverRef.current.get(id) ?? 0)) {     // вернулись к исходному — запрос не нужен
      setOverride((prev) => { const n = new Map(prev); n.delete(id); return n })
      return
    }
    busy.current.add(id)
    let ok = true
    try {
      await commit(id, target)
      await settle()
    } catch (e) {
      ok = false
      onError(e)
    } finally {
      busy.current.delete(id)
      setOverride((prev) => {
        // снимаем, если после отправки не кликали (или при ошибке — откат)
        if (!ok || prev.get(id) === target) { const n = new Map(prev); n.delete(id); return n }
        return prev
      })
      if (again.current.delete(id)) setTimeout(() => flush(id), 0)
    }
  }, [commit, settle, onError])

  const change = useCallback((id: string, step: number) => {
    setOverride((prev) => {
      const cur = prev.get(id) ?? serverRef.current.get(id) ?? 0
      if (cur + step < 0) return prev
      const n = new Map(prev)
      n.set(id, cur + step)
      return n
    })
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.set(id, setTimeout(() => flush(id), DEBOUNCE_MS))
  }, [flush])

  return { qty, change }
}
