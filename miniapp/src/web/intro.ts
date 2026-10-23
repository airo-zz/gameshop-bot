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

/**
 * Первый экран главной пришёл с сервера уже видимым (api/routers/seo_hero.py):
 * его не анимируем — иначе React спрятал бы готовый текст и проявил заново.
 * Проверяется до первого рендера React (пока в #root серверная разметка).
 */
export const heroFromServer = typeof document !== 'undefined' && !!document.getElementById('hero-ssr')

/** Анимировать ли появление (проверять при монтировании компонента). */
export const isIntro = () => active

/** Первая страница сеанса показана — дальше без анимаций появления. */
export function endIntro() {
  active = false
}
