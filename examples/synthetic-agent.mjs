import { createFileStore, runWake } from '../src/index.mjs'
import { resolve } from 'node:path'

const directory = resolve(process.env.GINGER_TAIL_STATE_DIR || '.ginger-tail-demo-state')
const identity = { id: 'synthetic-cat', name: 'Synthetic Cat' }
const store = createFileStore({ directory, agentId: identity.id })
const result = await runWake({
  identity,
  store,
  world: {
    async observe() { return { event: 'A sunny patch of floor is available.' } },
    // No executor: this demonstration cannot take external actions.
  },
  async decide() { return { kind: 'rest' } },
})
console.log(JSON.stringify({ ...result, agentId: identity.id, stateDirectory: directory }))
