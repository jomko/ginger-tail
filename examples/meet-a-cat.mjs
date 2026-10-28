// A small, independent cat: one wake per message, local memory, optional local LLM.
// No Ginger identity, private state, remote account, or third-party dependency.
import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createInterface } from 'node:readline'
import { createFileStore, runWake } from '../src/index.mjs'

const identity = { id: 'demo-cat', name: 'Mochi' }
const directory = resolve(process.env.GINGER_TAIL_CAT_DIR || '.ginger-tail-cat-state')
const historyFile = join(directory, 'conversation.json')
const store = createFileStore({ directory, agentId: identity.id })
const MAX_TEXT = 800
const MAX_MESSAGES = 12

async function readHistory() {
  let raw
  try {
    raw = await readFile(historyFile, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const rows = JSON.parse(raw)
  if (!Array.isArray(rows) || rows.length > MAX_MESSAGES ||
      rows.some(row => !row || !['user', 'assistant'].includes(row.role) ||
        typeof row.content !== 'string' || row.content.length > MAX_TEXT)) {
    throw new Error('Invalid cat history; refusing to reset it')
  }
  return rows
}

async function saveHistory(rows) {
  const temporary = join(directory, '.conversation-' + randomUUID() + '.tmp')
  await writeFile(temporary, JSON.stringify(rows, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temporary, historyFile)
}

async function answer(message, history) {
  if (!process.env.CAT_MODEL) {
    // Deliberately deterministic: this is NOT a pretend LLM.
    const previous = [...history].reverse().find(item => item.role === 'user')
    if (/remember|previous|last time|пам.?ята|минулого разу/i.test(message)) {
      return previous
        ? 'Meow. Last time you said: "' + previous.content.slice(0, 200) + '"'
        : 'Meow. We have not talked before.'
    }
    return 'Meow. I heard: "' + message.slice(0, 160) +
      '". I will remember this conversation. Ask what I remember.'
  }

  const endpoint = new URL('/api/chat', process.env.CAT_OLLAMA_URL || 'http://127.0.0.1:11434')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CAT_MODEL,
      stream: false,
      options: { num_predict: 160 },
      messages: [
        { role: 'system', content: 'You are Mochi, a curious, concise house cat. Be friendly, not servile. Reply in the language of the human. You can remember the visible conversation, but do not pretend to know anything else. No tool use or external actions.' },
        ...history,
        { role: 'user', content: message },
      ],
    }),
    signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) throw new Error('Ollama HTTP ' + response.status + '. Is the model installed?')
  const data = await response.json()
  const reply = data?.message?.content?.trim()
  if (!reply) throw new Error('Ollama returned no text')
  return reply.slice(0, MAX_TEXT)
}

async function talk(message) {
  const incoming = message.trim()
  if (!incoming || incoming.length > MAX_TEXT) throw new Error('Message must be 1–800 characters')
  let spoken
  const result = await runWake({
    identity, store,
    world: {
      async observe() {
        return { incoming, history: await readHistory() }
      },
      async execute({ action }) {
        const rows = await readHistory()
        await saveHistory([
          ...rows,
          { role: 'user', content: incoming },
          { role: 'assistant', content: action.payload.text },
        ].slice(-MAX_MESSAGES))
        spoken = action.payload.text
        return { status: 'confirmed', receiptId: randomUUID() }
      },
    },
    async decide({ observation }) {
      if (observation.incoming === '/sleep') return { kind: 'rest' }
      return { kind: 'action', action: {
        kind: 'say',
        payload: { text: await answer(observation.incoming, observation.history) },
      } }
    },
    // Only a local conversation write is approved. Never a post to the world.
    authorize: async ({ action }) =>
      action.kind === 'say' && typeof action.payload?.text === 'string' &&
      action.payload.text.length > 0 && action.payload.text.length <= MAX_TEXT,
  })
  if (result.outcome === 'acted') console.log('Mochi: ' + spoken)
  else if (result.outcome === 'rest') console.log('Mochi: Zzz. (Nothing posted.)')
  else throw new Error('Wake ' + result.outcome + ': ' + (result.reason || result.actionId || 'not authorized'))
}

async function main() {
  if (process.argv.length > 2) {
    await talk(process.argv.slice(2).join(' '))
    return
  }
  console.log('Meet Mochi. Type a message, /sleep to rest, or /quit to leave.')
  console.log(process.env.CAT_MODEL
    ? 'Mode: Ollama (' + process.env.CAT_MODEL + ')'
    : 'Mode: offline deterministic demo (no LLM). Set CAT_MODEL to use Ollama.')
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY })
  if (process.stdin.isTTY) rl.setPrompt('You> ')
  if (process.stdin.isTTY) rl.prompt()
  for await (const line of rl) {
    if (line.trim() === '/quit') break
    if (line.trim()) await talk(line)
    if (process.stdin.isTTY) rl.prompt()
  }
  rl.close()
}

main().catch(error => {
  console.error('Mochi could not finish the wake: ' + error.message)
  process.exitCode = 1
})
