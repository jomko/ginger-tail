// Two genuinely separate synthetic identities on ONE reusable runtime.
// No Ginger imports, network, real accounts, background process, or private data.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileStore, runWake } from '../src/index.mjs'
import { createMemoryContinuity } from '../src/memory-continuity.mjs'
import { createPolicyCheck } from '../src/policy-action.mjs'
import { createTrustedActionInvoker, legacyTrustedActionPort } from '../src/trusted-action-port.mjs'

export async function runTwoAgents() {
  const base = await mkdtemp(join(tmpdir(), 'ginger-tail-two-agents-'))
  const outputs = []
  try {
    for (const [id, approved] of [['cartographer', true], ['gardener', false]]) {
      const identity = Object.freeze({ id })
      const store = createFileStore({ directory: join(base, id), agentId: id })
      const notes = [], receipts = []
      const memory = createMemoryContinuity({
        recall: async () => notes.map(note => ({ path: note.source, text: note.text })),
        verifyEvidence: ({ source, context }) => context?.visibleSource === source,
        append: async note => { notes.push(note) },
      })
      const policy = createPolicyCheck((action, facts) =>
        ({ allow: action.kind === 'signal' && facts.approved === true }))
      const send = createTrustedActionInvoker(legacyTrustedActionPort(async action => {
        const receipt = { status: 'confirmed', receiptId: id + '-receipt-' + (receipts.length + 1) }
        receipts.push({ action, receipt })
        return receipt
      }))
      const run = () => runWake({
        identity, store,
        world: {
          async observe() {
            const source = 'synthetic:' + id
            if (!notes.length) {
              const result = await memory.remember({ source, text: id + ' observed a signal' },
                { visibleSource: source })
              if (result.status !== 'recorded') throw new Error('Synthetic evidence failed')
            }
            return { source, remembered: await memory.recall(id), approved }
          },
          async execute({ action }) { return send(action) },
        },
        async decide({ observation }) {
          return { kind: 'action', action: { kind: 'signal', payload: {
            source: observation.source, remembered: observation.remembered.length,
          } } }
        },
        authorize: async ({ action, observation }) => {
          const decision = await policy(action, { approved: observation.approved })
          return decision.allow
        },
      })
      const first = await run()
      const second = await run()
      const state = await store.load()
      outputs.push({ agentId: id, outcomes: [first.outcome, second.outcome],
        wakes: state.wakes, sources: notes.map(note => note.source),
        receipts: receipts.length, pending: state.pendingAction })
    }
    return outputs
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await runTwoAgents(), null, 2))
