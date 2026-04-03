// src/App.tsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTelegram } from '@/hooks/useTelegram'
import { authenticateWithTelegram } from '@/api/client'
import { useAuthStore, useCartStore } from '@/store'
import { cartApi } from '@/api'

import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import CatalogPage from '@/pages/CatalogPage'
import GamePage from '@/pages/GamePage'
import ProductPage from '@/pages/ProductPage'
import CartPage from '@/pages/CartPage'
import CheckoutPage from '@/pages/CheckoutPage'
import OrdersPage from '@/pages/OrdersPage'
import OrderDetailPage from '@/pages/OrderDetailPage'
import ProfilePage from '@/pages/ProfilePage'
import FavoritesPage from '@/pages/FavoritesPage'
import SearchPage from '@/pages/SearchPage'
import SupportPage from '@/pages/SupportPage'
import LoadingScreen from '@/components/ui/LoadingScreen'
import ErrorScreen from '@/components/ui/ErrorScreen'

export default function App() {
  const { initData } = useTelegram()
  const { isReady, isError, setReady, setError } = useAuthStore()
  const { setItemsCount } = useCartStore()

  // ── Инициализация: авторизация → загрузка корзины ─────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // Авторизуемся через Telegram initData
        if (initData) {
          try {
            await authenticateWithTelegram(initData)
          } catch (authErr) {
            console.warn('Auth endpoint not available yet, skipping:', authErr)
          }
        } else {
          console.warn('No initData — skipping Telegram auth')
        }

        // Загружаем количество позиций в корзине для бейджа
        try {
          const cart = await cartApi.get()
          setItemsCount(cart.items_count)
        } catch {
          // Не критично — API может быть ещё не готов
        }

        setReady()
      } catch (err) {
        console.error('Auth failed:', err)
        setError()
      }
    }
    init()
  }, [initData, setReady, setError, setItemsCount])

  if (isError)  return <ErrorScreen />
  if (!isReady) return <LoadingScreen />

  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="catalog/:slug" element={<GamePage />} />
          <Route path="product/:id" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
