import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root'
import { npcRuntime } from './game/npcRuntime'
import { loadWorldConfig } from './state/contentStore'
import { initTheme } from './state/themeStore'
import './styles/index.css'
import './styles/front.css'
import './styles/portal.css'

// Apply the saved theme before anything renders, so there is no flash of the
// wrong palette while the world config is being fetched.
initTheme()

/**
 * The crowd is seeded before the first render so the instanced meshes always
 * have their full instance count when they mount.
 *
 * How many people walk the streets, and where, is published by the
 * administrator portal, so those settings are fetched first. A slow or
 * unreachable API must not hold up the first paint, so the wait is bounded and
 * the city falls back to the catalogue it was authored with.
 */
const WORLD_CONFIG_TIMEOUT_MS = 2500

async function bootstrap(): Promise<void> {
  await Promise.race([
    loadWorldConfig(),
    new Promise((resolve) => setTimeout(resolve, WORLD_CONFIG_TIMEOUT_MS)),
  ])

  npcRuntime.init()

  const container = document.getElementById('root')
  if (!container) throw new Error('Root container missing')

  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
}

void bootstrap()
