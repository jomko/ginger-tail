// Deterministic, source-agnostic attention lifecycle state machine.
// A world adapter supplies renderInterest so these transitions never assume
// a forum URL, a character identity, or a particular storage format.
// History projection, locks, migrations, and external I/O belong to the host.
import { createHash, randomBytes } from 'node:crypto'

const ID = /^[a-f0-9]{10}$/
const EVENTS = new Set(['open', 'revise', 'defer', 'resume', 'close'])
const sha = s => createHash('sha256').update(s).digest('hex')
const postIdOk = x => x === undefined || (Number.isSafeInteger(x) && x > 0)
export const isInterestId = id => typeof id === 'string' && ID.test(id)

export function replayInterestEvents(events, renderInterest) {
  if (typeof renderInterest !== 'function') throw TypeError('An interest renderer is required')
  const items = new Map()
  const known = new Set()
  let active = null
  events.forEach((e, n) => {
    const fail = why => { throw Error('attention log line ' + (n + 1) + ': ' + why) }
    if (!e || typeof e !== 'object' || e.v !== 1 || !EVENTS.has(e.op) || !isInterestId(e.id) ||
      typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) fail('malformed event')
    const item = items.get(e.id)
    if (e.op === 'open' || e.op === 'revise') {
      if (typeof e.text !== 'string' || !e.text.trim() || !postIdOk(e.postId) ||
        (e.raw !== undefined && typeof e.raw !== 'string')) fail('invalid interest')
      if (e.op === 'open' && (item || active)) fail('open conflicts with existing state')
      if (e.op === 'revise' && active !== e.id) fail('revise of a non-active interest')
      const next = { id: e.id, state: 'active', text: e.text, ...(e.postId ? { postId: e.postId } : {}),
        ...(e.raw !== undefined ? { raw: e.raw } : {}), since: item?.since ?? e.at, updatedAt: e.at }
      items.set(e.id, next)
      active = e.id
      known.add(sha(renderInterest(next)))
    } else if (e.op === 'defer') {
      if (active !== e.id) fail('defer of a non-active interest')
      Object.assign(item, { state: 'dormant', updatedAt: e.at })
      active = null
    } else if (e.op === 'resume') {
      if (item?.state !== 'dormant' || active) fail('resume of a non-dormant interest')
      Object.assign(item, { state: 'active', updatedAt: e.at })
      active = e.id
    } else {
      if (!item || item.state === 'closed') fail('close of an unknown or closed interest')
      if (active === e.id) active = null
      Object.assign(item, { state: 'closed', updatedAt: e.at })
    }
  })
  return interestSnapshot(items, known)
}

export function interestSnapshot(items, known) {
  const all = [...items.values()]
  const newest = (a, b) => b.updatedAt.localeCompare(a.updatedAt)
  return {
    writable: true, items, known,
    active: all.find(i => i.state === 'active') || null,
    dormant: all.filter(i => i.state === 'dormant').sort(newest),
    closed: all.filter(i => i.state === 'closed').sort(newest),
  }
}

export function cloneInterestSnapshot(snapshot) {
  const items = new Map([...snapshot.items].map(([k, v]) => [k, { ...v }]))
  return { items, known: new Set(snapshot.known) }
}

// Pure transition planner. Returns events to append and the resulting snapshot,
// or { refused } without touching anything.
export function planInterestTransition(snapshot, request, { now = new Date(), newId = () => randomBytes(5).toString('hex'), renderInterest } = {}) {
  if (typeof renderInterest !== 'function') throw TypeError('An interest renderer is required')
  const { items, known } = cloneInterestSnapshot(snapshot)
  const at = now.toISOString()
  const events = []
  const emit = e => { events.push({ v: 1, at, ...e }) }
  const active = [...items.values()].find(i => i.state === 'active')
  const target = request.id ? items.get(request.id) : null
  const op = request.op
  if (op === 'carry') {
    if (typeof request.text !== 'string' || !request.text.trim() || !postIdOk(request.postId)) return { refused: 'invalid-carry' }
    const same = active && ((request.postId && active.postId === request.postId) ||
      active.text.trim() === request.text.trim())
    if (same && active.text === request.text && active.postId === request.postId) return { events, snapshot, id: active.id, unchanged: true }
    if (active && !same) emit({ op: 'defer', id: active.id, via: 'switch' })
    let id = same ? active.id : newId()
    while (!same && items.has(id)) id = newId()
    emit({ op: same ? 'revise' : 'open', id, text: request.text,
      ...(request.postId ? { postId: request.postId } : {}), via: 'carry' })
  } else if (op === 'defer') {
    if (!active) return { refused: 'no-active' }
    emit({ op: 'defer', id: active.id, via: 'action' })
  } else if (op === 'resume') {
    if (!target) return { refused: 'unknown-id' }
    if (target.state === 'closed') return { refused: 'closed-is-final' }
    if (target.state === 'active') return { events, snapshot, id: target.id, unchanged: true }
    if (active) emit({ op: 'defer', id: active.id, via: 'switch' })
    emit({ op: 'resume', id: target.id, via: 'action' })
  } else if (op === 'close') {
    const item = request.id ? target : active
    if (!item) return { refused: request.id ? 'unknown-id' : 'no-active' }
    if (item.state === 'closed') return { events, snapshot, id: item.id, unchanged: true }
    emit({ op: 'close', id: item.id, via: 'action' })
  } else return { refused: 'unsupported-op' }
  const next = applyInterestEvents(items, known, events, renderInterest)
  return { events, snapshot: next, id: events.at(-1).id }
}

export function applyInterestEvents(items, known, events, renderInterest) {
  if (typeof renderInterest !== 'function') throw TypeError('An interest renderer is required')
  for (const e of events) {
    const item = items.get(e.id)
    if (e.op === 'open' || e.op === 'revise') {
      const next = { id: e.id, state: 'active', text: e.text, ...(e.postId ? { postId: e.postId } : {}),
        ...(e.raw !== undefined ? { raw: e.raw } : {}), since: item?.since ?? e.at, updatedAt: e.at }
      items.set(e.id, next)
      known.add(sha(renderInterest(next)))
    } else Object.assign(item, { state: { defer: 'dormant', resume: 'active', close: 'closed' }[e.op], updatedAt: e.at })
  }
  return interestSnapshot(items, known)
}

