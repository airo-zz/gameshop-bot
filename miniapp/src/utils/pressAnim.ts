// src/utils/pressAnim.ts
// Короткая CSS-анимация «нажатия» кнопки (класс anim-press, index.css).
// Перезапускается при каждом клике: снимаем класс, форсируем reflow, ставим снова.
import type { MouseEvent } from 'react'

export function pressBtn(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  el.classList.remove('anim-press')
  void el.offsetWidth
  el.classList.add('anim-press')
}
