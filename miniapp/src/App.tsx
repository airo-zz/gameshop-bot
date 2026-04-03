// src/App.tsx
import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
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
  // Гарантируем что init() выполнится ровно один раз,
  // независимо от нестабильности ссылок в deps
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function init() {
      try {
        // Авторизуемся через Telegram initData
        if (initData) {
          try {
            await authenticateWithTelegram(initData)
          } catch {
            // Auth API может быть недоступен — продолжаем без токена
          }
        }

        // Загружаем корзину (не критично если упадёт)
        try {
          const cart = await cartApi.get()
          setItemsCount(cart.items_count)
        } catch {
          // OK — пользователь не авторизован или API недоступен
        }

        setReady()
      } catch (err) {
        console.error('Init failed:', err)
        setError()
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isError) return <ErrorScreen />
  if (!isReady) return <LoadingScreen />

  return (
    <BrowserRouter basename="/app">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a0533',
            color: '#fff',
            border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 500,
          },
          success: { iconTheme: { primary: '#a78bfa', secondary: '#1a0533' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#1a0533' } },
        }}
      />
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
