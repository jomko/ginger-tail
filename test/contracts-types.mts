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

function typecheckOnly(): void {
const controller: CognitionControl<{action: string}, {action: string}> = createCognitionControl({
  model: async () => ({ action: 'rest' }),
  parseReply: reply => reply,
  invalidReason: () => null,
  invalidActionError: reason => Error(reason),
})
void controller.decide('Synthetic choice')
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
  generate: async ({ prompt, maxOutputTokens }) => prompt.slice(0, maxOutputTokens),
}
const memory: MemoryPort<{ text: string }> = { recall: async () => [{ text: 'Synthetic note' }] }
const version: number = WAKE_CONTRACT_VERSION
const receiptIsValid: boolean = isConfirmedActionReceipt({ status: 'confirmed', receiptId: 'synthetic' })

void [result, decision, model, memory, version, receiptIsValid]
}
void typecheckOnly
