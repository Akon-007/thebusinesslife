import { seedAccounts } from './bootstrap'
import { app } from './app'
import { startClock, stopClock } from './clock'
import { NODE_ENV, PORT } from './config'

/**
 * The API entry point.
 *
 * The Express application lives in `app.ts` so it can be imported by tests;
 * this file is responsible only for binding it to a port and running the
 * world clock. The clock is started here — not in `app.ts` — so the test
 * suite never has a timer advancing the simulation underneath it.
 */

if (process.env.SEED_DEMO_ACCOUNTS === 'true') seedAccounts()

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] BUSINESSLIFE API listening on http://localhost:${PORT} (${NODE_ENV})`)
  startClock()
  console.log('[sim] world clock running')
})

function shutdown(signal: string) {
  stopClock()
  console.log(`[api] ${signal} received, shutting down.`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
