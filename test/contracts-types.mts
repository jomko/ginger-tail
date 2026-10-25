import {
  runWake, createFileStore,
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
import { classifyActionOutcome, createActionOutcomeGate, type ActionOutcome } from 'ginger-tail/action-outcomes'

function typecheckOnly(): void {
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
