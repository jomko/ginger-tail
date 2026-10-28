import {
  runWake, createFileStore, resolvePendingAction,
  type FileStatePort, type WakeLockDiagnostics, type ReconciliationResult, type ReconciliationVerdict,
  type WakeLockError, type StateDurabilityError,
  type AgentIdentity, type WakePorts, type WakeResult,
  type WorldPort, type CognitionPort, type ActionPolicyPort,
} from 'ginger-tail'
import {
  WAKE_CONTRACT_VERSION, parseWakeDecision, isConfirmedActionReceipt,
  type MemoryPort, type ModelPort, type WakeDecision,
} from 'ginger-tail/contracts'

import { createCognitionControl, type CognitionControl } from 'ginger-tail/cognition-control'
import { explorationTurns, closingTurn } from 'ginger-tail/cognition-journey'
import { createDecisionDispatcher, type DecisionFlow } from 'ginger-tail/decision-dispatch'
import { createModelInvoker, legacyModelPort, type ResidentModelPort } from 'ginger-tail/model-port'
import { createWorldReader, legacyWorldReadPort, type ResidentWorldReadPort } from 'ginger-tail/world-read-port'
import { classifyActionOutcome, createActionOutcomeGate, type ActionOutcome } from 'ginger-tail/action-outcomes'

function typecheckOnly(): void {
const worldReadPort: ResidentWorldReadPort<{ id: number }, { id: number }> =
  legacyWorldReadPort(async (_operation, input) => ({ id: input.id }))
const readWorld = createWorldReader(worldReadPort)
const worldResult: Promise<{ id: number }> | { id: number } = readWorld('post', { id: 1 })
void worldResult
const modelPort: ResidentModelPort<{ action: string }> = legacyModelPort(
  async prompt => ({ action: prompt.length ? 'rest' : 'invalid' })
)
const modelTurn = createModelInvoker(modelPort)
const untrustedModelResult: Promise<{ action: string }> | { action: string } =
  modelTurn('synthetic prompt')
void untrustedModelResult

const controller: CognitionControl<{action: string}, {action: string}> = createCognitionControl({
  model: async () => ({ action: 'rest' }),
  parseReply: reply => reply,
  invalidReason: () => null,
  invalidActionError: reason => Error(reason),
})
void controller.decide('Synthetic choice')
void explorationTurns({ control: controller, prompt: () => 'Synthetic observation' })
void closingTurn({ control: controller, prompt: () => 'Synthetic closing', allowed: action => action.action === 'rest' })
const identity: AgentIdentity = { id: 'synthetic-cat' }
const store = createFileStore({ directory: '/tmp/synthetic-only', agentId: identity.id })
const world: WorldPort = { observe: async ({ identity }) => ({ from: identity.id }) }
const decide: CognitionPort = async ({ observation }) =>
  observation === null ? { kind: 'rest' } : { kind: 'rest' }
const authorize: ActionPolicyPort = async () => false
const ports: WakePorts = { identity, store, world, decide, authorize }
const result: Promise<WakeResult> = runWake(ports)
const decision: WakeDecision = parseWakeDecision({ kind: 'rest' })
const model: ModelPort = {
  generate: async ({ prompt }) => prompt,
}
const memory: MemoryPort<{ text: string }> = { recall: async () => [{ text: 'Synthetic note' }] }
const version: number = WAKE_CONTRACT_VERSION
const receiptIsValid: boolean = isConfirmedActionReceipt({ status: 'confirmed', receiptId: 'synthetic' })

void [result, decision, model, memory, version, receiptIsValid]
}
const outcome: ActionOutcome = classifyActionOutcome({ status: 'uncertain' })
const gate = createActionOutcomeGate()
void outcome
void gate.observe({ status: 'blocked' })
const route = createDecisionDispatcher<{action:string}>({
  rest: () => 'stop',
  read: async () => 'continue' as const,
})
const signal: Promise<DecisionFlow> = route({action:'rest'})
void signal
void typecheckOnly

async function reliabilityTypecheckOnly(store: FileStatePort): Promise<void> {
  const lock: WakeLockDiagnostics = await store.inspectLock()
  const wake: WakeResult = await runWake({ identity: { id: 'synthetic-cat' }, store,
    world: { observe: () => ({}) }, decide: () => ({ kind: 'rest' }), signal: AbortSignal.abort() })
  if (wake.outcome === 'uncertain') {
    const recorded: boolean = wake.recorded
    const receiptId: string | undefined = wake.receipt?.receiptId
    const reason: 'execution_failed' | 'receipt_invalid' | 'completion_not_persisted' = wake.reason
    void [recorded, receiptId, reason]
  } else if (wake.outcome === 'acted') {
    const durable: false | undefined = wake.durable
    const id: string = wake.actionId
    void [durable, id]
  } else if (wake.outcome === 'reservation_not_durable') {
    const id: string = wake.actionId
    void id
  }
  const resolved: ReconciliationResult = await resolvePendingAction({
    identity: { id: 'synthetic-cat' }, store, actionId: 'action-1', resolvedBy: 'operator',
    verify: ({ actionId }): ReconciliationVerdict => ({ status: 'not-executed', actionId, evidenceId: 'lookup' }),
  })
  const errors: [WakeLockError['code'], StateDurabilityError['unsupported']] = ['WAKE_LOCKED', true]
  void [lock, resolved, errors]
}
void reliabilityTypecheckOnly
