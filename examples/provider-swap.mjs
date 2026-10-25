// Runnable proof of model-provider substitution with one unchanged Tail
// cognition loop. Entirely synthetic: no Codex, external account, sockets,
// credentials, publication adapter, or persistent demo files.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWake, createFileStore } from '../src/index.mjs'
import { createModelInvoker } from '../src/model-port.mjs'
import { createCognitionControl } from '../src/cognition-control.mjs'
import { explorationTurns, closingTurn } from '../src/cognition-journey.mjs'
import { createDecisionDispatcher } from '../src/decision-dispatch.mjs'

const IDENTITY = Object.freeze({ id: 'synthetic-provider-cat' })
const EVENT = 'A synthetic light flickers beside an empty notebook.'

class InvalidSyntheticReply extends Error {}

/** Provider A: a transcript replay, like a fixture-backed model adapter. */
export function replayModelPort() {
  const transcript = [{ action: 'inspect' }, { action: 'rest' }]
  return Object.freeze({
    generate: async ({ prompt }) => {
      if (typeof prompt !== 'string') throw new Error('Invalid replay prompt')
      if (!transcript.length) throw new Error('Unexpected additional model call')
      return transcript.shift()
    },
  })
}

/** Provider B: an independent local rules model, using prompt observations. */
export function rulesModelPort() {
  return Object.freeze({
    generate: async ({ prompt }) => {
      const context = JSON.parse(prompt)
      return context.inspected ? { action: 'rest' } : { action: 'inspect' }
    },
  })
}

/**
 * Exactly the same engine + cognition function works with either model port.
 * The host-only "inspect" action reads an already supplied synthetic event.
 * Every external action is denied; there is no model-dependent policy branch.
 */
export async function runSyntheticWake(modelPort) {
  const directory = await mkdtemp(join(tmpdir(), 'ginger-tail-provider-proof-'))
  const store = createFileStore({ directory, agentId: IDENTITY.id })
  const trace = []
  let modelCalls = 0
  let externalExecutions = 0
  try {
    const model = createModelInvoker(modelPort)
    const result = await runWake({
      identity: IDENTITY,
      store,
      world: {
        observe: async () => ({ event: EVENT }),
        // A deliberately unreachable external executor: no permission grant.
        execute: async () => { externalExecutions++; throw new Error('Forbidden external action') },
      },
      async decide({ observation }) {
        const control = createCognitionControl({
          model: async prompt => { modelCalls++; return model(prompt) },
          parseReply(reply) {
            if (!reply || typeof reply !== 'object' || Array.isArray(reply) ||
                !['inspect', 'rest'].includes(reply.action)) {
              throw new InvalidSyntheticReply('Invalid synthetic model action')
            }
            return { action: reply.action }
          },
          invalidReason: error => error instanceof InvalidSyntheticReply ? 'invalid-action' : null,
          invalidActionError: () => new InvalidSyntheticReply('Not allowed in this phase'),
          explorationAction: action => action.action === 'inspect',
          maxExplorationSteps: 2,
          maxModelCalls: 5,
        })
        const dispatch = createDecisionDispatcher({
          inspect: () => { trace.push({ action: 'inspect', event: observation.event }) },
          rest: () => { trace.push({ action: 'rest' }); return 'stop' },
        })
        const prompt = () => JSON.stringify({
          event: observation.event,
          inspected: trace.some(x => x.action === 'inspect'),
        })
        let stopped = false
        for await (const proposal of explorationTurns({ control, prompt })) {
          // An exhausted invalid-reply retry is an intentional rest:
          // do not request a new closing model call after this failure.
          if (proposal === null) { stopped = true; break }
          if (await dispatch(proposal) === 'stop') { stopped = true; break }
        }
        if (!stopped) {
          const { decision } = await closingTurn({
            control, prompt, allowed: action => action.action === 'rest',
          })
          if (decision) await dispatch(decision)
        }
        return { kind: 'rest' }
      },
      // Intentionally no authorize port: runWake denies external actions by default.
    })
    const state = await store.load()
    return {
      agentId: IDENTITY.id,
      outcome: result.outcome,
      wakes: state.wakes,
      modelCalls,
      trace,
      pendingAction: state.pendingAction,
      externalExecutions,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

// This is a manual offline demo, not a daemon or another resident agent.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const replay = await runSyntheticWake(replayModelPort())
  const rules = await runSyntheticWake(rulesModelPort())
  console.log(JSON.stringify({ replay, rules, identical: JSON.stringify(replay) === JSON.stringify(rules) }, null, 2))
}
