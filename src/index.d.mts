export {
  WAKE_CONTRACT_VERSION, MAX_ACTION_BYTES, MAX_OBSERVATION_BYTES,
  assertAgentIdentity, assertWakePorts, parseWakeDecision,
  assertBoundedObservation, isConfirmedActionReceipt,
} from './contracts.mjs'
export type {
  AgentIdentity, WakeState, Observation, ActionProposal, WakeDecision,
  ConfirmedActionReceipt, StatePort, WorldPort, CognitionPort,
  ActionPolicyPort, MemoryPort, ModelPort, WakePorts, WakeResult,
  PendingAction, ReconciliationRecord, UncertainReason,
} from './contracts.mjs'

import type { AgentIdentity, PendingAction, StatePort, WakePorts, WakeResult } from './contracts.mjs'

export declare function runWake(input: WakePorts): Promise<WakeResult>

/**
 * Evidence from a TRUSTED host lookup of the exact action id in the external
 * system. Anything else (including an authorization claim) leaves it unresolved.
 */
export type ReconciliationVerdict =
  | { status: 'confirmed'; actionId: string; receiptId: string }
  | { status: 'not-executed'; actionId: string; evidenceId: string }

export type ReconciliationResult =
  | { outcome: 'resolved'; actionId: string; resolution: 'confirmed'; receiptId: string }
  | { outcome: 'resolved'; actionId: string; resolution: 'not-executed' }
  | { outcome: 'already-resolved'; actionId: string; resolution: 'confirmed' | 'not-executed' }
  | { outcome: 'unresolved'; actionId: string; reason: string }

/** Trusted host/operator operation. Never expose to a model. Never executes or retries the action. */
export declare function resolvePendingAction(input: {
  identity: AgentIdentity
  store: StatePort
  actionId: string
  verify(input: { identity: AgentIdentity; actionId: string; pendingAction: PendingAction }):
    Promise<ReconciliationVerdict | unknown> | ReconciliationVerdict | unknown
  /** Audit identity of the operator. Recorded, not an authorization. */
  resolvedBy: string
  now?: () => string
}): Promise<ReconciliationResult>

export interface WakeLockDiagnostics {
  status: 'free' | 'live' | 'stale' | 'uncertain'
  reason?: string
  path: string
  claim?: string
  owner?: { token: string; pid: number; hostname: string; acquiredAt: string }
}

export interface FileStatePort extends StatePort {
  /** Read-only: never removes or changes the lock. */
  inspectLock(): Promise<WakeLockDiagnostics>
}

export declare function createFileStore(input: { directory: string; agentId: string }): FileStatePort

export declare class WakeLockError extends Error {
  readonly code: 'WAKE_LOCKED'
  readonly lock: WakeLockDiagnostics
}

export declare class StateDurabilityError extends Error {
  readonly code: 'STATE_DURABILITY_UNCONFIRMED'
  /** True when the platform/filesystem cannot fsync a directory. */
  readonly unsupported: boolean
}
