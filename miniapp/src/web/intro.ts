/**
 * src/web/intro.ts
 * Анимации появления на сайте — только при первой загрузке за сеанс браузера.
 * Обновление страницы и переходы между страницами — сразу, без анимаций
 * (контент рисуется моментально, как у GalaxyLink).
 *
 * Флаг решается один раз при запуске сайта: первая страница сеанса анимируется,
 * после первого перехода (endIntro из WebLayout) — больше нет.
 */
const KEY = 'site_intro_done'

let active = (() => {
  try {
    if (sessionStorage.getItem(KEY)) return false
    sessionStorage.setItem(KEY, '1')
    return true
  } catch {
    return false
  }
})()

/** Анимировать ли появление (проверять при монтировании компонента). */
export const isIntro = () => active

/** Первая страница сеанса показана — дальше без анимаций появления. */
export function endIntro() {
  active = false
}
