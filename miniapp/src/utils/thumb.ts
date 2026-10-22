/**
 * src/utils/thumb.ts
 * Уменьшенные WebP-копии загруженных картинок (создаёт сервер, api/utils/thumbs.py):
 *   …/static/uploads/<имя>.png → …/static/uploads/<имя>.w320.webp (и .w640.webp).
 * Для чужих адресов и не-uploads возвращает null — тогда грузим оригинал.
 * При ошибке загрузки копии компонент переключается на оригинал (onThumbError).
 */
import type { SyntheticEvent } from 'react'

const UPLOAD_RE = /^(.*\/static\/uploads\/[^/?#]+?)\.(png|jpe?g|webp)$/i

export function thumbUrl(url: string | null | undefined, width: 320 | 640): string | null {
  const m = url ? UPLOAD_RE.exec(url) : null
  return m ? `${m[1]}.w${width}.webp` : null
}

/** srcSet для <img>: 320w и 640w (браузер сам выберет по размеру и плотности экрана). */
export function thumbSrcSet(url: string | null | undefined): string | undefined {
  const a = thumbUrl(url, 320)
  const b = thumbUrl(url, 640)
  return a && b ? `${a} 320w, ${b} 640w` : undefined
}

/** Копии нет (старый файл не обработан) — показываем оригинал. */
export function onThumbError(original: string) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.dataset.fallback) return
    img.dataset.fallback = '1'
    img.removeAttribute('srcset')
    img.src = original
  }
}
