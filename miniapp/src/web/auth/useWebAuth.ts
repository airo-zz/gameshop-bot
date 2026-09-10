/**
 * src/web/auth/useWebAuth.ts
 * Авторизация пользователя на сайте (через Telegram Login Widget).
 * Состояние = наличие профиля в кэше React Query. Токены хранит client.ts
 * (localStorage в браузерном режиме).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  authenticateWithTelegramWidget,
  clearTokens,
  hasStoredToken,
  type TelegramWidgetUser,
} from '@/api/client'
import { profileApi, type Profile } from '@/api'

const PROFILE_KEY = ['web', 'profile'] as const

export function useWebAuth() {
  const qc = useQueryClient()

  const { data: user, isLoading } = useQuery<Profile | null>({
    queryKey: PROFILE_KEY,
    queryFn: profileApi.get,
    enabled: hasStoredToken(),
    retry: false,
    staleTime: 5 * 60_000,
  })

  async function login(widgetUser: TelegramWidgetUser): Promise<void> {
    await authenticateWithTelegramWidget(widgetUser)
    const profile = await profileApi.get()
    qc.setQueryData(PROFILE_KEY, profile)
  }

  function logout(): void {
    clearTokens()
    qc.setQueryData(PROFILE_KEY, null)
    qc.removeQueries({ queryKey: PROFILE_KEY })
  }

  return {
    user: user ?? null,
    isAuthenticated: !!user,
    ready: !isLoading,
    login,
    logout,
  }
}
