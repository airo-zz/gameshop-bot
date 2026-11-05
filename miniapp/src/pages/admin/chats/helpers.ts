/**
 * src/pages/admin/chats/helpers.ts
 * Общие функции чатов админки: время и даты сообщений, имя и инициалы покупателя, шаблоны быстрых уведомлений (localStorage).
 * Часть страницы «Чаты» админки (pages/admin/AdminChatsPage.tsx).
 */

import { userIdLabel, type AdminChatListItem } from '@/api/admin'

export const DEFAULT_TEMPLATES = [
  'Ваш заказ обрабатывается',
  'Ответим в ближайшее время',
  'Пожалуйста, уточните детали',
  'Товар зарезервирован',
]

export const LS_KEY = 'admin_notify_templates'

export function loadTemplates(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_TEMPLATES
}

export function saveTemplates(t: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(t))
}

export function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function getDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString()
}

export function getUserLabel(user: AdminChatListItem['user']): string {
  if (user.first_name) {
    return user.username ? `${user.first_name} @${user.username}` : user.first_name
  }
  return user.username ? `@${user.username}` : (user.email || userIdLabel(user))
}

export function getInitials(user: AdminChatListItem['user']): string {
  if (user.first_name) return user.first_name.slice(0, 1).toUpperCase()
  if (user.username) return user.username.slice(0, 1).toUpperCase()
  return '#'
}

export function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
}
