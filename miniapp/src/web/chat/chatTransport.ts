/**
 * src/web/chat/chatTransport.ts
 * Запросы чата сайта от имени вошедшего пользователя (chatApi с его токенами)
 * или гостя (токен гостевого чата, доступ только к /chat и загрузке скриншотов).
 * Гость заводится на сервере лениво — при первом сообщении.
 */
import axios from 'axios'
import { chatApi, type ChatInfo, type ChatMessage } from '@/api'
import { BASE_URL, getGuestToken, setGuestToken } from '@/api/client'

export interface ChatTransport {
  /** false — гость ещё ничего не писал: чата на сервере нет */
  ready: () => boolean
  getChat: () => Promise<ChatInfo>
  getMessages: () => Promise<ChatMessage[]>
  send: (text: string | null, attachments: string[]) => Promise<ChatMessage>
  upload: (file: File) => Promise<string>
  markRead: () => Promise<void>
}

export const userTransport: ChatTransport = {
  ready: () => true,
  getChat: chatApi.getOrCreate,
  getMessages: () => chatApi.getMessages(),
  send: chatApi.sendMessage,
  upload: (f) => chatApi.upload(f).then((r) => r.url),
  markRead: () => chatApi.markRead().then(() => undefined),
}

const guestHttp = () =>
  axios.create({ baseURL: BASE_URL, headers: { Authorization: `Bearer ${getGuestToken()}` } })

async function ensureGuest(): Promise<void> {
  if (getGuestToken()) return
  const r = await axios.post<{ guest_token: string }>(`${BASE_URL}/chat/guest`)
  setGuestToken(r.data.guest_token)
}

export const guestTransport: ChatTransport = {
  ready: () => !!getGuestToken(),
  getChat: () => guestHttp().get<ChatInfo>('/chat').then((r) => r.data),
  getMessages: () => guestHttp().get<ChatMessage[]>('/chat/messages', { params: { limit: 50 } }).then((r) => r.data),
  send: async (text, attachments) => {
    await ensureGuest()
    return guestHttp().post<ChatMessage>('/chat/messages', { text, attachments }).then((r) => r.data)
  },
  upload: async (file) => {
    await ensureGuest()
    const fd = new FormData()
    fd.append('file', file)
    return guestHttp().post<{ url: string }>('/support/upload', fd).then((r) => r.data.url)
  },
  markRead: () => guestHttp().post('/chat/read').then(() => undefined),
}
