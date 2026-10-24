/** The published contract covers only the existing offline wake prototype. */
export declare const WAKE_CONTRACT_VERSION: 1
export declare const MAX_ACTION_BYTES: 4096
export declare const MAX_OBSERVATION_BYTES: 16384

export interface AgentIdentity {
  id: string
  [key: string]: unknown
}

export interface WakeState {
  version: number
  agentId: string
  wakes: number
  lastOutcome: string | null
  pendingAction: null | { id: string; status: 'pending' | 'uncertain'; kind?: string; at?: string }
  lastReceipt: null | { actionId: string; receiptId: string; kind: string }
}

export type Observation = unknown
export type ActionProposal = { kind: string; payload: Record<string, unknown> }
export type WakeDecision = { kind: 'rest' } | { kind: 'action'; action: ActionProposal }
export type ConfirmedActionReceipt = { status: 'confirmed'; receiptId: string }

export interface StatePort {
  withLock<T>(callback: () => Promise<T>): Promise<T>
  load(): Promise<WakeState>
  save(state: WakeState): Promise<void>
}

export interface WorldPort {
  observe(input: { identity: AgentIdentity; state: WakeState }): Promise<Observation> | Observation
  execute?(input: {
    identity: AgentIdentity
    action: ActionProposal
    actionId: string
  }): Promise<ConfirmedActionReceipt | unknown> | ConfirmedActionReceipt | unknown
}

export type CognitionPort = (input: {
  identity: AgentIdentity
  observation: Observation
  state: WakeState
}) => Promise<WakeDecision> | WakeDecision

export type ActionPolicyPort = (input: {
  identity: AgentIdentity
  action: ActionProposal
  observation: Observation
  state: WakeState
}) => Promise<boolean> | boolean

/**
 * Read-only interface reserved for a later cognition/memory integration.
 * The v1 runWake prototype does NOT call a memory adapter.
 */
export interface MemoryPort<T = unknown> {
  recall(input: {
    identity: AgentIdentity
    query: string
    limit: number
  }): Promise<readonly T[]>
}

/**
 * Model invocation is separate from cognition, which interprets its response.
 * The v1 runWake prototype does NOT invoke this interface directly.
 */
export interface ModelPort {
  generate(input: { prompt: string; maxOutputTokens: number }): Promise<string>
}

export interface WakePorts {
  identity: AgentIdentity
  store: StatePort
  world: WorldPort
  decide: CognitionPort
  authorize?: ActionPolicyPort
  now?: () => string
  actionId?: () => string
}

export type WakeResult =
  | { outcome: 'rest' | 'denied' | 'acted'; wakes: number; actionId?: string }
  | { outcome: 'uncertain'; actionId: string }
  | { outcome: 'blocked'; reason: 'unresolved_action'; actionId: string }

export declare function assertAgentIdentity(identity: unknown): void
export declare function assertWakePorts(input?: {
  store?: StatePort
  world?: WorldPort
  decide?: CognitionPort
  authorize?: ActionPolicyPort
}): void
export declare function parseWakeDecision(decision: unknown): WakeDecision
export declare function assertBoundedObservation(observation: unknown): void
export declare function isConfirmedActionReceipt(receipt: unknown): receipt is ConfirmedActionReceipt
