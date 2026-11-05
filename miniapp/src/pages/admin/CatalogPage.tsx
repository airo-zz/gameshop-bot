/**
 * src/pages/admin/CatalogPage.tsx
 * Двухуровневый каталог: Игры → Воркспейс игры.
 * Воркспейс = аккордеон категорий, под каждой — её товары и строка быстрого
 * создания лота. Всё для одной игры на одном экране.
 */

import { useState } from 'react'
import { type AdminGame } from '@/api/admin'
import { GameWorkspaceLevel } from './catalog/GameWorkspaceLevel'
import { GamesLevel } from './catalog/GamesLevel'

type Step = 'games' | 'workspace'

export default function CatalogPage() {
  const [step, setStep] = useState<Step>('games')
  const [selectedGame, setSelectedGame] = useState<AdminGame | null>(null)

  const handleSelectGame = (game: AdminGame) => {
    setSelectedGame(game)
    setStep('workspace')
  }

  const handleBackToGames = () => {
    setSelectedGame(null)
    setStep('games')
  }

  return (
    <>
      {step === 'games' && (
        <GamesLevel onSelect={handleSelectGame} />
      )}

      {step === 'workspace' && selectedGame && (
        <GameWorkspaceLevel
          game={selectedGame}
          onBack={handleBackToGames}
        />
      )}
    </>
  )
}
