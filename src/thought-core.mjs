// Private thoughts are observations, never a publication queue.
// The engine validates structure; only the host defines trusted sources and
// how a source is described to the model.
import { randomUUID } from 'node:crypto'

export const MAX_THOUGHTS = 32
const ID = /^thought-[0-9a-f-]{36}$/
const EVIDENCE = new Set(['complete', 'partial', 'self-observation'])

export function createThoughtCore({ isSource, isSelfSource, formatSpark, newId = randomUUID } = {}) {
  if (typeof isSource !== 'function' || typeof isSelfSource !== 'function' ||
      typeof formatSpark !== 'function' || typeof newId !== 'function') {
    throw new TypeError('Trusted source validators and spark formatter are required')
  }

  // Missing provenance on older source-linked thoughts is not silently upgraded.
  function thoughtEvidenceStatus(row) {
    if (row?.evidenceStatus) return row.evidenceStatus
    return isSelfSource(row?.source) ? 'self-observation' : 'legacy-unclassified'
  }

  function validThought(row) {
    return !!row && typeof row === 'object' && !Array.isArray(row) &&
      typeof row.id === 'string' && ID.test(row.id) &&
      typeof row.source === 'string' && isSource(row.source) &&
      typeof row.text === 'string' && row.text.trim().length >= 12 && row.text.length <= 700 &&
      typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) &&
      (row.evidenceStatus === undefined || (EVIDENCE.has(row.evidenceStatus) &&
        (isSelfSource(row.source) ? row.evidenceStatus === 'self-observation'
          : row.evidenceStatus === 'complete' || row.evidenceStatus === 'partial')))
  }

  function makeThought({ source, thought }, now = new Date().toISOString(),
                       evidenceStatus = isSelfSource(source) ? 'self-observation' : undefined) {
    // A sourced claim without explicit evidence can never be created as complete.
    if (!EVIDENCE.has(evidenceStatus)) throw Error('missing thought evidence status')
    const row = { id: 'thought-' + newId(), source, text: thought.trim(), createdAt: now, evidenceStatus }
    if (!validThought(row)) throw Error('invalid thought')
    return row
  }

  function boundThoughts(rows) {
    if (!Array.isArray(rows) || rows.some(row => !validThought(row))) throw Error('invalid thought store')
    const ids = new Set()
    for (const row of rows) {
      if (ids.has(row.id)) throw Error('duplicate thought ID')
      ids.add(row.id)
    }
    return rows.slice(-MAX_THOUGHTS)
  }

  // Sharing is a separate, explicit action: storing a thought never posts it.
  function thoughtIntent(thought, whyNow) {
    if (!validThought(thought) || typeof whyNow !== 'string' ||
        whyNow.trim().length < 12 || whyNow.length > 350) {
      throw Error('invalid thought sharing')
    }
    return {
      spark: formatSpark(thought),
      point: thought.text.slice(0, 350),
      whyNow,
    }
  }

  return Object.freeze({ thoughtEvidenceStatus, validThought, makeThought, boundThoughts, thoughtIntent })
}
