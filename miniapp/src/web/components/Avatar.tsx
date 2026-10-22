/**
 * src/web/components/Avatar.tsx
 * Аватар пользователя: картинка с /api/v1/avatar/{tg} или буква, если фото нет
 * (эндпоинт отдаёт 404) — без «битой картинки».
 */
import { useState } from 'react'

export default function Avatar({ src, name, size = 32 }: { src: string | null | undefined; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-semibold text-[var(--text)]"
      style={{ width: size, height: size, background: 'var(--accent)', fontSize: size * 0.4 }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}
