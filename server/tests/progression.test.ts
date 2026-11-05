import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestUser } from './harness'

/**
 * Server-authoritative progression.
 *
 * The player submits what they did; the server decides what that earns. These
 * tests prove a client cannot talk its way to a level, and that progression
 * never pays out cash.
 */

const { startServer } = await import('../app')
const { signToken } = await import('../security')

let handle: Awaited<ReturnType<typeof startServer>>
let token: string

interface Snapshot {
  progress: {
    stageIndex: number
    levelIndex: number
    xp: number
    reputation: number
    cash: number
    completedLevels: string[]
  } | null
  board: { objectiveId: string; progress: number; done: boolean; kind: string }[]
}

interface EvidenceReply {
  recorded: number
  deduplicated: boolean
  snapshot: Snapshot
}

before(async () => {
  const userId = createTestUser({ role: 'PLAYER' })
  token = signToken(userId, 'PLAYER')
  handle = await startServer(0)
})

after(async () => {
  await handle.close()
})

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(`${handle.url}/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = (await response.json().catch(() => null)) as T
  return { status: response.status, body }
}

test('a new player starts at level 1 with no rewards', async () => {
  const reply = await call<Snapshot>('/player/progress')
  assert.equal(reply.status, 200)
  assert.equal(reply.body.progress?.levelIndex, 1)
  assert.equal(reply.body.progress?.xp, 0)
  assert.equal(reply.body.progress?.reputation, 0)
  assert.deepEqual(reply.body.progress?.completedLevels, [])
})

test('the client cannot push its own progress', async () => {
  // The old mirror endpoint is gone; only evidence is accepted.
  const reply = await call('/player/progress', {
    method: 'PUT',
    body: {
      stageIndex: 1,
      levelIndex: 15,
      xp: 9_000_000,
      cash: 50_000_000,
      reputation: 999,
      completedLevels: ['L1', 'L2', 'L3'],
    },
  })
  assert.ok(reply.status === 404 || reply.status === 405, `expected the route to be gone, got ${reply.status}`)

  const after = await call<Snapshot>('/player/progress')
  assert.equal(after.body.progress?.levelIndex, 1, 'tampering must not grant levels')
  assert.equal(after.body.progress?.xp, 0, 'tampering must not grant xp')
  assert.equal(after.body.progress?.cash, 0, 'tampering must not grant cash')
})

test('evidence that satisfies every objective completes the level', async () => {
  const reply = await call<EvidenceReply>('/player/progress/evidence', {
    method: 'POST',
    body: {
      idempotencyKey: 'evidence-l1-open',
      events: [
        { kind: 'visit_building', target: 'business_hub' },
        { kind: 'talk_role', target: 'mentor' },
        { kind: 'collect_info', target: 'mentorship_advice' },
        { kind: 'business_action', target: 'write_business_idea' },
        { kind: 'business_action', target: 'define_problem' },
      ],
    },
  })

  assert.equal(reply.status, 200)
  assert.equal(reply.body.recorded, 5)
  assert.equal(reply.body.snapshot.progress?.levelIndex, 2, 'the server advances the level')
  assert.equal(reply.body.snapshot.progress?.xp, 60, 'L1 awards 60 xp')
  assert.equal(reply.body.snapshot.progress?.reputation, 1)
  assert.ok(reply.body.snapshot.progress?.completedLevels.includes('L1'))
  assert.equal(reply.body.snapshot.progress?.cash, 0, 'a level must never pay out cash')
})

test('evidence the current level does not call for is ignored', async () => {
  const reply = await call<EvidenceReply>('/player/progress/evidence', {
    method: 'POST',
    body: {
      idempotencyKey: 'evidence-bogus',
      events: [
        { kind: 'business_action', target: 'launch_product' },
        { kind: 'visit_building', target: 'registration_office' },
      ],
    },
  })

  assert.equal(reply.body.recorded, 0, 'objectives from other levels are not accepted')
  assert.equal(reply.body.snapshot.progress?.levelIndex, 2, 'the level does not move')
})

test('a retried piece of evidence is recorded once', async () => {
  const body = {
    idempotencyKey: 'evidence-l2-visit',
    events: [{ kind: 'visit_building', target: 'market' }],
  }

  const first = await call<EvidenceReply>('/player/progress/evidence', { method: 'POST', body })
  assert.equal(first.body.recorded, 1)

  const retry = await call<EvidenceReply>('/player/progress/evidence', { method: 'POST', body })
  assert.equal(retry.body.recorded, 0)
  assert.equal(retry.body.deduplicated, true)

  const objective = retry.body.snapshot.board.find((entry) => entry.objectiveId === 'L2.o1')
  assert.equal(objective?.progress, 1, 'the market visit counted once, not twice')
})
