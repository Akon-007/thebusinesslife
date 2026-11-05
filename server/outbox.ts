import { one, run } from './db'
import { newId } from './security'

/**
 * The event outbox.
 *
 * Every state change that follows from a player action is written here in the
 * same transaction that made the change, so downstream work — notifications,
 * mission evaluation, lecturer reporting — can be driven from a durable record
 * of what happened rather than by re-deriving it.
 *
 * `idempotencyKey` is unique: a retried request that already wrote its event
 * returns the existing row instead of queueing the consequence twice.
 */

export interface OutboxEvent {
  /** The company the event belongs to, when it concerns one. */
  companyId?: string | null
  /** A stable type name, e.g. `invoice.paid`, `bill.paid`, `level.completed`. */
  type: string
  payload?: Record<string, unknown>
  /**
   * Derived from the action that caused the event — never random. A retry of
   * the same action must carry the same key.
   */
  idempotencyKey: string
  occurredAt?: string
}

export interface OutboxResult {
  eventId: string
  deduplicated: boolean
}

/** Appends an event. Safe to call inside a larger transaction. */
export function emitEvent(event: OutboxEvent): OutboxResult {
  const existing = one<{ id: string }>(
    'SELECT id FROM event_outbox WHERE idempotency_key = ?',
    event.idempotencyKey,
  )
  if (existing) return { eventId: existing.id, deduplicated: true }

  const id = newId()
  const now = event.occurredAt ?? new Date().toISOString()
  run(
    `INSERT INTO event_outbox (id, company_id, type, payload, status, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
    id,
    event.companyId ?? null,
    event.type,
    JSON.stringify(event.payload ?? {}),
    event.idempotencyKey,
    now,
  )
  return { eventId: id, deduplicated: false }
}
