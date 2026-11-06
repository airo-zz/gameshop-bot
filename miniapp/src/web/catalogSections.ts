/**
 * src/web/catalogSections.ts
 * Разделы сайта: донат в играх и пополнение сервисов — это «Каталог» (упор на донат);
 * ключи игр — отдельный раздел: в меню «Каталог» под чертой и своя страница (?type=key).
 * Один источник для страницы каталога, блока на главной и меню в шапке.
 */

import { Gamepad2, KeyRound, Wallet } from '@/components/ui/icons'
import type { Game } from '@/api'

export type SectionId = 'game' | 'key' | 'service'

export interface Section {
  id: SectionId
  /** вкладка */
  label: string
  /** заголовок в меню и на странице */
  title: string
  /** подпись в меню */
  hint: string
  Icon: typeof Gamepad2
  /** «ещё 12 игр» */
  plural: [string, string, string]
}

export const SECTIONS: Section[] = [
  { id: 'game', label: 'Донат', title: 'Донат в играх', hint: 'Валюта, наборы и боевые пропуски', Icon: Gamepad2, plural: ['игру', 'игры', 'игр'] },
  { id: 'key', label: 'Ключи игр', title: 'Ключи игр', hint: 'Steam, Xbox, Rockstar — ключ сразу после оплаты', Icon: KeyRound, plural: ['ключ', 'ключа', 'ключей'] },
  { id: 'service', label: 'Сервисы', title: 'Пополнение сервисов', hint: 'PlayStation, App Store, Xbox и другие', Icon: Wallet, plural: ['сервис', 'сервиса', 'сервисов'] },
]

export const sectionOf = (g: Pick<Game, 'type'>): SectionId =>
  g.type === 'service' ? 'service' : g.type === 'key' ? 'key' : 'game'

export const sectionById = (id: SectionId) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]

/** «Каталог»: донат и сервисы. Ключи — отдельно (KEYS_SECTION) */
export const CATALOG_SECTIONS = SECTIONS.filter((s) => s.id !== 'key')
export const KEYS_SECTION = sectionById('key')

/** ?type= в адресе каталога */
export const sectionFromParam = (v: string | null): SectionId => (v === 'service' || v === 'key' ? v : 'game')

export const catalogHref = (id: SectionId) => (id === 'game' ? '/catalog' : `/catalog?type=${id}`)
