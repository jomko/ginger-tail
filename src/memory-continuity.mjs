// Generic, host-backed memory continuity. The model cannot certify its own
// evidence. Reads are bounded and annotations remain observations, not facts.
const validObject = value => value && typeof value === 'object' && !Array.isArray(value)
export function createMemoryContinuity({ recall, verifyEvidence, append }) {
  if (typeof recall !== 'function' || typeof verifyEvidence !== 'function' ||
      typeof append !== 'function') throw new TypeError('Trusted memory adapters required')
  return Object.freeze({
    async recall(query, { limit = 5, maxChars = 9500 } = {}) {
      if (typeof query !== 'string' || query.length > 8192 ||
          !Number.isSafeInteger(limit) || limit < 0 || limit > 20 ||
          !Number.isSafeInteger(maxChars) || maxChars < 0 || maxChars > 24000)
        throw new TypeError('Invalid memory recall bounds')
      if (!limit || !maxChars) return []
      const rows = await recall(query, { limit, maxChars })
      if (!Array.isArray(rows)) throw new Error('Invalid trusted recall response')
      const selected = []
      let remaining = maxChars
      for (const row of rows.slice(0, limit)) {
        if (!validObject(row) || typeof row.text !== 'string' ||
            typeof row.path !== 'string' || !row.path ||
            Buffer.byteLength(row.text, 'utf8') > remaining) {
          // Truncation could silently strip evidence: never return a partial row.
          continue
        }
        selected.push(row)
        remaining -= Buffer.byteLength(row.text, 'utf8')
      }
      return selected
    },
    async remember(note, evidenceContext) {
      if (!validObject(note) || typeof note.text !== 'string' || !note.text.trim() ||
          note.text.length > 900 || typeof note.source !== 'string' ||
          !note.source || note.source.length > 2048)
        throw new TypeError('Invalid source-backed observation')
      // Trusted host computes verification from actually visible/read sources,
      // never from a `verified` field provided by a model.
      if (await verifyEvidence({ source: note.source, context: evidenceContext }) !== true)
        return { status: 'denied', reason: 'evidence-not-verified' }
      await append(note)
      return { status: 'recorded', classification: 'observation-not-fact' }
    },
  })
}
