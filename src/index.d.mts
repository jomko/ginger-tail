export {
  WAKE_CONTRACT_VERSION, MAX_ACTION_BYTES, MAX_OBSERVATION_BYTES,
  assertAgentIdentity, assertWakePorts, parseWakeDecision,
  assertBoundedObservation, isConfirmedActionReceipt,
} from './contracts.mjs'
export type {
  AgentIdentity, WakeState, Observation, ActionProposal, WakeDecision,
  ConfirmedActionReceipt, StatePort, WorldPort, CognitionPort,
  ActionPolicyPort, MemoryPort, ModelPort, WakePorts, WakeResult,
} from './contracts.mjs'

import type { AgentIdentity, StatePort, WakePorts, WakeResult } from './contracts.mjs'

export declare function runWake(input: WakePorts): Promise<WakeResult>
export declare function createFileStore(input: { directory: string; agentId: string }): StatePort
