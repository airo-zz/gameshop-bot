/**
 * src/pages/admin/AdminChatsPage.tsx
 * Страница «Чаты» админки: слева список чатов (опрос каждые несколько секунд,
 * непрочитанные сверху, блок заказов, ждущих оператора), справа — переписка.
 * Части страницы — в папке ./chats/.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageSquare } from '@/components/ui/icons'
import { adminApi, type AdminChatListItem, type AdminOrderListItem } from '@/api/admin'
import { ChatDetailPanel } from './chats/ChatDetailPanel'
import { ChatListPanel } from './chats/ChatListPanel'

export default function AdminChatsPage() {
  const { id: chatIdParam } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [chats, setChats] = useState<AdminChatListItem[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(chatIdParam ?? null)
  const [pendingOrders, setPendingOrders] = useState<AdminOrderListItem[]>([])

  // Detect mobile (< 768px)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Sync selectedId with URL param
  useEffect(() => {
    setSelectedId(chatIdParam ?? null)
  }, [chatIdParam])

  const fetchChats = useCallback(async (silent = false) => {
    if (!silent) setLoadingChats(true)
    try {
      const [chatsData, ordersData] = await Promise.all([
        adminApi.getChats(),
        adminApi.getOrders({ status: 'paid', unassigned: true, page_size: 20 }),
      ])
      setChats(chatsData)
      setPendingOrders(ordersData.items)
    } catch {
      // ignore
    } finally {
      if (!silent) setLoadingChats(false)
    }
  }, [])

  useEffect(() => {
    fetchChats()
    const interval = setInterval(() => fetchChats(true), 2000)
    return () => clearInterval(interval)
  }, [fetchChats])

  const handleClaimOrder = useCallback(async (orderId: string) => {
    // Оптимистично убираем из списка
    setPendingOrders(prev => prev.filter(o => o.id !== orderId))
    try {
      await adminApi.claimOrder(orderId)
    } catch {
      // При ошибке refetch вернёт актуальное состояние
      fetchChats(true)
    }
  }, [fetchChats])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    navigate(`/admin/chats/${id}`, { replace: true })
    // Мгновенно сбрасываем бейдж в списке без ожидания следующего poll
    setChats(prev => prev.map(c => c.id === id ? { ...c, admin_unread_count: 0 } : c))
  }, [navigate])

  const handleOpenOrderChat = useCallback((orderId: string) => {
    // Ищем чат, привязанный к этому заказу
    const linked = chats.find(c => c.order?.id === orderId)
    if (linked) {
      handleSelect(linked.id)
    }
  }, [chats, handleSelect])

  const handleBack = useCallback(() => {
    setSelectedId(null)
    navigate('/admin/chats', { replace: true })
  }, [navigate])

  // Mobile: show list OR detail
  if (isMobile) {
    if (selectedId) {
      return (
        <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
          <ChatDetailPanel chatId={selectedId} onBack={handleBack} />
        </div>
      )
    }
    return (
      <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
        <ChatListPanel
          chats={chats}
          loading={loadingChats}
          selectedId={null}
          onSelect={handleSelect}
          pendingOrders={pendingOrders}
          onClaimOrder={handleClaimOrder}
          onOpenOrderChat={handleOpenOrderChat}
        />
      </div>
    )
  }

  // Desktop: two-panel
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
      {/* Left sidebar */}
      <div style={{ width: 280, flexShrink: 0, overflow: 'hidden' }}>
        <ChatListPanel
          chats={chats}
          loading={loadingChats}
          selectedId={selectedId}
          onSelect={handleSelect}
          pendingOrders={pendingOrders}
          onClaimOrder={handleClaimOrder}
          onOpenOrderChat={handleOpenOrderChat}
        />
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedId ? (
          <ChatDetailPanel chatId={selectedId} onBack={handleBack} />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%',
            color: 'rgba(220,235,255,0.2)',
          }}>
            <MessageSquare size={48} style={{ opacity: 0.2 }} />
            <p style={{ margin: '12px 0 0', fontSize: 14 }}>Выберите чат</p>
          </div>
        )}
      </div>
    </div>
  )
}
