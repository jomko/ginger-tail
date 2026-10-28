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
  pendingAction: null | PendingAction
  lastReceipt: null | { actionId: string; receiptId: string; kind: string }
  /**
   * Bounded audit trail written by resolvePendingAction and by automatic
   * completion recovery (latest 100 decisions, 20 failed attempts). Absent in v0.1.0 state.
   */
  reconciliations?: ReconciliationRecord[]
}

/** Why runWake returned `uncertain`. In every case the agent stays blocked on that action id. */
export type UncertainReason = 'execution_failed' | 'receipt_invalid' | 'completion_not_persisted'

/**
 * Why a pending record is `uncertain`. `completion_pending`: the confirmed
 * receipt is recorded (`receipt`) but the block was not durably cleared;
 * the next wake finalizes it automatically (outcome `recovered`).
 */
export type PendingReason = 'execution_failed' | 'receipt_invalid' | 'completion_pending'

export interface PendingAction {
  id: string
  /** `pending`: reserved, outcome unknown (possibly crashed). `uncertain`: outcome known to be unconfirmed. */
  status: 'pending' | 'uncertain'
  kind?: string
  at?: string
  reason?: PendingReason
  /** The confirmed receipt, recorded before the block is cleared (two-phase completion). */
  receipt?: { receiptId: string }
  /** Bounded diagnostics only; never an exception message. */
  error?: { name: string; code?: string }
}

export interface ReconciliationRecord {
  actionId: string
  kind: string | null
  previousStatus: 'pending' | 'uncertain'
  previousReason?: PendingReason
  resolution: 'confirmed' | 'not-executed' | 'unresolved'
  reason?: string
  receiptId?: string
  evidenceId?: string
  error?: { name: string; code?: string }
  /**
   * Present only on entries written by automatic completion recovery, whose
   * `resolvedBy` is then `ginger-tail:completion-recovery`.
   */
  automatic?: true
  resolvedBy: string
  at: string
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
  observe(input: { identity: AgentIdentity; state: WakeState; signal?: AbortSignal }): Promise<Observation> | Observation
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
  signal?: AbortSignal
}) => Promise<WakeDecision> | WakeDecision

export type ActionPolicyPort = (input: {
  identity: AgentIdentity
  action: ActionProposal
  observation: Observation
  state: WakeState
  signal?: AbortSignal
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
 * The resident host now uses the same provider-neutral adapter as
 * ginger-tail/model-port. The v1 runWake prototype still calls a host
 * cognition callback rather than a ModelPort directly.
 */
export type ModelPort<Reply = unknown> =
  import('./model-port.mjs').ResidentModelPort<Reply>

export interface WakePorts {
  identity: AgentIdentity
  store: StatePort
  world: WorldPort
  decide: CognitionPort
  authorize?: ActionPolicyPort
  now?: () => string
  actionId?: () => string
  /**
   * Cancels waiting on observe/decide/authorize. Never honored once the
   * action reservation is persisted: an execution is never abandoned.
   */
  signal?: AbortSignal
}

export type WakeResult =
  | { outcome: 'rest' | 'denied'; wakes: number }
  | {
      outcome: 'acted'
      actionId: string
      wakes: number
      /**
       * Present only as `false`: the receipt IS durably recorded, but clearing
       * the block was not confirmed durable. If the clear is lost, the next
       * wake finalizes it from that receipt and returns `recovered`.
       */
      durable?: false
    }
  | {
      /**
       * This wake found a durable `completion_pending` record and finalized
       * that earlier action from its recorded trusted receipt. It did not
       * observe, decide, authorize or call `world.execute`, and `wakes` is
       * unchanged. The next wake runs normally.
       */
      outcome: 'recovered'
      actionId: string
      receiptId: string
      kind: string
      wakes: number
    }
  | {
      /**
       * The reservation was renamed into place but could not be confirmed
       * durable. runWake did NOT call world.execute. The visible reservation
       * blocks later wakes; after power loss it may be absent. It is never
       * cleared automatically: resolve it as `not-executed`.
       */
      outcome: 'reservation_not_durable'
      actionId: string
    }
  | {
      outcome: 'uncertain'
      actionId: string
      reason: UncertainReason
      /**
       * Whether the uncertain record was confirmed durable. Either way the
       * visible state blocks this action id (the reservation or the record).
       */
      recorded: boolean
      /** Present for `completion_not_persisted`: the effect WAS confirmed. Keep it for reconciliation. */
      receipt?: { actionId: string; receiptId: string; kind: string }
    }
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
