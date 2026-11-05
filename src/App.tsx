import { useEffect, useState } from 'react'
import { GameCanvas } from './game/GameCanvas'
import { Hud } from './ui/Hud'
import { PanelHost } from './ui/panels/PanelHost'
import { StartScreen } from './ui/StartScreen'
import { BriefingModal } from './ui/BriefingModal'
import { useAuthStore } from './state/authStore'
import { useGameStore } from './state/gameStore'
import { useWorldStore } from './state/worldStore'
import { startProgressSync } from './state/progressSync'
import { useFinanceStore } from './state/financeStore'
import { loadAuthoredContent } from './state/contentStore'

/**
 * Root of the game: the WebGL world is always mounted underneath, and the HUD,
 * panels and overlays are layered on top of it.
 */
export function App() {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

  // A character that already exists means the player belongs in the city. The
  // seed below reads the server-confirmed profile instead of defaulting to
  // `false`, so reloading the page resumes the game rather than restarting it.
  const hasCharacter = profile !== null
  const [started, setStarted] = useState(hasCharacter)
  // A briefing is shown whenever the player arrives at a level they have not
  // been briefed on yet — including levels restored from a save.
  const [seenLevel, setSeenLevel] = useState(levelIndex)
  // Administrator edits are fetched before the world renders, so every part of
  // the HUD reads the same, already-merged picture of the content.
  const [contentReady, setContentReady] = useState(false)

  const briefingOpen = started && levelIndex !== seenLevel

  useEffect(() => {
    useWorldStore.getState().setOverlay(!started || briefingOpen)
  }, [started, briefingOpen])

  // Progress is mirrored to the server for as long as the player is in the game.
  useEffect(() => startProgressSync(), [])

  // The company's ledger is the authority on money. Loading it adopts the
  // server's cash balance; the client never writes a balance back.
  useEffect(() => {
    void useFinanceStore.getState().load()
  }, [])

  useEffect(() => {
    void loadAuthoredContent().finally(() => setContentReady(true))
  }, [])

  // The character is owned by the server. When the saved profile arrives it is
  // adopted into the local save — the founder's name, the company and the
  // avatar — and the player is dropped straight into the city.
  useEffect(() => {
    if (!profile) return
    const game = useGameStore.getState()
    useGameStore.setState({
      playerName: user?.fullName || game.playerName,
      businessName: profile.businessName || game.businessName,
      avatarId: profile.avatarId || game.avatarId,
    })
    setStarted(true)
  }, [profile, user])

  return (
    <div className="game-root">
      <div className="game-canvas">
        <GameCanvas />
      </div>

      {started && contentReady && (
        <div className="ui-layer">
          <Hud />
        </div>
      )}

      <PanelHost />

      <BriefingModal open={briefingOpen} onClose={() => setSeenLevel(levelIndex)} />

      {!started && <StartScreen onStart={() => setStarted(true)} />}
    </div>
  )
}
