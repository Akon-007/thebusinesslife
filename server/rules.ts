/**
 * Rule versions.
 *
 * Every result the simulation saves records the version of the rules that
 * produced it, so a decision can always be explained against the rulebook that
 * was in force at the time. Bump a version whenever the rule it governs changes
 * meaning — an assessment made under `v1` stays interpretable after the rules
 * move on.
 */
export const RULE_VERSIONS = {
  /** How evidence is turned into objective progress, levels and rewards. */
  progression: 'progression@1',
  /** How company money, bills, invoices and payments are posted. */
  finance: 'finance@1',
  /** How a company is provisioned and seeded. */
  company: 'company@1',
  /** How the world clock advances time and settles each simulated day. */
  simulation: 'simulation@1',
} as const

export type RuleDomain = keyof typeof RULE_VERSIONS
