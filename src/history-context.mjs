// One budget for what cognition sees of this wake and for what memory may cite.
// The prompt renders whole history items only, newest first; an item that no
// longer fits becomes a short stub. Memory evidence (remember-source.mjs) uses
// the very same rendering, so "visible to the model" has one meaning.
export const HISTORY_BUDGET = 45000
// A single read_post item stays well under the history budget, leaving room for
// the next few steps while the thread is still fully visible.
export const READ_ITEM_BUDGET = 38000
// A search item: about the volume the old 20000-char string cut allowed,
// counted on the item as it appears in history (escaping included).
export const SEARCH_ITEM_BUDGET = 22000

function countNodes(rows) {
  let n = 0
  const stack = Array.isArray(rows) ? [...rows] : []
  while (stack.length) {
    const item = stack.pop()
    n++
    if (Array.isArray(item?.answers)) stack.push(...item.answers)
  }
  return n
}

// Pre-order prefix of the comment tree: every kept reply keeps its parent, and
// the earliest part of the discussion stays in its original order.
function prefixTree(rows, keep) {
  let left = keep
  const walk = list => {
    const out = []
    for (const c of Array.isArray(list) ? list : []) {
      if (left <= 0) break
      left--
      out.push(Array.isArray(c?.answers) ? { ...c, answers: walk(c.answers) } : c)
    }
    return out
  }
  return walk(rows)
}

/**
 * History item for a fetched thread. Whole thread when it fits; otherwise the
 * post and the earliest comments, never a JSON string cut mid-way, with an
 * explicit `truncated` marker. A truncated item is never memory evidence.
 */
export function boundedReadItem(action, payload, { budget = READ_ITEM_BUDGET } = {}) {
  const post = payload?.post
  const comments = Array.isArray(payload?.comments) ? payload.comments : []
  const make = (p, rows, truncated) => ({ action, title: post?.title ?? null, comments: post?.comments ?? null,
    result: JSON.stringify({ post: p, comments: rows }), ...(truncated ? { truncated } : {}) })
  const fits = item => JSON.stringify(item).length <= budget
  const whole = make(post, comments)
  if (fits(whole)) return { item: whole, shownComments: comments }
  const total = countNodes(comments)
  const marker = shown => ({ shownComments: shown, totalComments: total })
  let lo = 0, hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(make(post, prefixTree(comments, mid), marker(mid)))) lo = mid
    else hi = mid - 1
  }
  if (fits(make(post, prefixTree(comments, lo), marker(lo)))) {
    const shown = prefixTree(comments, lo)
    return { item: make(post, shown, marker(lo)), shownComments: shown }
  }
  // Even the post alone is too large: keep its beginning, still valid JSON.
  const content = typeof post?.content === 'string' ? post.content : ''
  const cut = { ...marker(0), postContentCut: true }
  let a = 0, b = content.length
  while (a < b) {
    const mid = Math.ceil((a + b) / 2)
    if (fits(make({ ...post, content: content.slice(0, mid) }, [], cut))) a = mid
    else b = mid - 1
  }
  return { item: make({ ...post, content: content.slice(0, a) }, [], cut), shownComments: [] }
}

/**
 * History item for a search. Whole results in their original order while the
 * item fits; the rest are left out with an explicit `truncated` marker, never
 * a JSON string cut mid-way. Other payload fields (total, sorting) stay as-is.
 */
export function boundedSearchItem(action, payload, repeatsThisWake, { budget = SEARCH_ITEM_BUDGET } = {}) {
  const rows = Array.isArray(payload?.results) ? payload.results : null
  const make = (result, truncated) => ({ action, result: JSON.stringify(result), repeatsThisWake,
    resultsFound: rows ? rows.length : null, ...(truncated ? { truncated } : {}) })
  const fits = item => JSON.stringify(item).length <= budget
  const whole = make(payload ?? null)
  if (fits(whole)) return whole
  if (!rows) return make({}, { shownResults: 0, totalResults: null })
  const marker = shown => ({ shownResults: shown, totalResults: rows.length })
  const prefix = k => make({ ...payload, results: rows.slice(0, k) }, marker(k))
  let lo = 0, hi = rows.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(prefix(mid))) lo = mid
    else hi = mid - 1
  }
  // Even the empty list with the other fields is too large: keep the marker only.
  return fits(prefix(lo)) ? prefix(lo) : make({ results: [] }, marker(0))
}

function stubOf(item) {
  const name = typeof item?.action === 'string' ? item.action : item?.action?.action
  const postId = item?.postId ?? item?.action?.postId
  const term = item?.action?.term
  return { action: typeof name === 'string' ? name : 'unknown', ...(Number.isSafeInteger(postId) ? { postId } : {}),
    ...(typeof term === 'string' ? { term: term.slice(0, 180) } : {}),
    ...(typeof item?.title === 'string' ? { title: item.title.slice(0, 120) } : {}), omitted: 'context-budget' }
}

/**
 * The exact "this wake" text cognition receives, plus the set of history items
 * shown in full. Chronological order; never a partial item.
 */
export function renderHistory(history, budget = HISTORY_BUDGET) {
  const items = Array.isArray(history) ? history : []
  const kept = [], visible = new Set()
  const reserve = 48 // room for the omitted-steps marker
  let used = 2, i = items.length - 1
  for (; i >= 0; i--) {
    const sep = kept.length ? 1 : 0
    const full = JSON.stringify(items[i])
    if (used + sep + full.length <= budget - reserve) { kept.unshift(full); visible.add(items[i]); used += sep + full.length; continue }
    const stub = JSON.stringify(stubOf(items[i]))
    if (used + sep + stub.length <= budget - reserve) { kept.unshift(stub); used += sep + stub.length; continue }
    break
  }
  if (i >= 0) kept.unshift(JSON.stringify({ omittedEarlierSteps: i + 1 }))
  return { text: '[' + kept.join(',') + ']', visible }
}
