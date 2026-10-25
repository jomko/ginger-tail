export interface PolicyDecision { allow: boolean; reason?: string }
export declare function createPolicyCheck<Action extends object, Facts = unknown>(
  check: (action: Action, facts: Facts) => boolean | PolicyDecision | Promise<boolean | PolicyDecision>
): (action: Action, facts: Facts) => Promise<PolicyDecision>
