/**
 * src/api/client.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Axios-клиент с автоматической JWT авторизацией.
 *
 * При первом запросе:
 *   1. Отправляет Telegram initData в заголовке X-Telegram-Init-Data
 *   2. Получает access + refresh токены
 *   3. Все последующие запросы используют Bearer access token
 *   4. При 401 — автоматически обновляет токен через refresh
 * ─────────────────────────────────────────────────────────────────────────
 */

import axios, {
  AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig
} from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

// ── Хранилище токенов (в памяти — не localStorage!) ──────────────────────────
let accessToken: string | null = null
let refreshToken: string | null = null
let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

function setTokens(access: string, refresh: string) {
  accessToken  = access
  refreshToken = refresh
}

function clearTokens() {
  accessToken  = null
  refreshToken = null
}

// ── Axios instance ────────────────────────────────────────────────────────────
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — добавляем Authorization + fix multipart ────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    // При FormData удаляем Content-Type — axios сам выставит multipart с boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  }
)

// ── Response interceptor — обновление токена при 401 ─────────────────────────
apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    if (isRefreshing) {
      // Ставим в очередь и ждём пока другой запрос обновит токен
      return new Promise((resolve) => {
        pendingRequests.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(apiClient(original))
        })
      })
    }

    isRefreshing = true

    try {
      if (!refreshToken) throw new Error('No refresh token')

      const res = await axios.post(`${BASE_URL}/payments/auth/refresh`, {
        refresh_token: refreshToken,
      })

      const { access_token, refresh_token } = res.data
      setTokens(access_token, refresh_token)

      // Повторяем все ожидавшие запросы
      pendingRequests.forEach((cb) => cb(access_token))
      pendingRequests = []

      original.headers.Authorization = `Bearer ${access_token}`
      return apiClient(original)
    } catch {
      clearTokens()
      pendingRequests = []
      // Не делаем reload — просто отклоняем запрос, чтобы не вызвать бесконечный цикл
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)

// ── Авторизация через Telegram initData ───────────────────────────────────────
export async function authenticateWithTelegram(initData: string): Promise<void> {
  const res = await axios.post(
    `${BASE_URL}/payments/auth/telegram`,
    {},
    { headers: { 'X-Telegram-Init-Data': initData } }
  )
  setTokens(res.data.access_token, res.data.refresh_token)
}

export { setTokens, clearTokens }
