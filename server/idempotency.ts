import { createHash } from 'node:crypto'

/**
 * Deterministic idempotency keys.
 *
 * A key has exactly one job: the same action must produce the same key, so a
 * retried request collapses onto the transaction that already landed instead of
 * posting a second one. A freshly generated random value cannot do that — a
 * retry would carry a different key and duplicate the effect.
 *
 * Callers derive a key from the action itself and send it. When they do not,
 * `actionKey` derives one from the action's own content, which is stable across
 * a retry of that identical request and never uses randomness.
 */
export function actionKey(prefix: string, scope: string, body: unknown): string {
  const signature = createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex')
    .slice(0, 32)
  return `${prefix}:${scope}:${signature}`
}
