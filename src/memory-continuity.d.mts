export interface ContinuityMemory<Row = { path: string; text: string }, Note = { source: string; text: string }> {
  recall(query: string, options?: { limit?: number; maxChars?: number }): Promise<Row[]>
  remember(note: Note, evidenceContext?: unknown): Promise<
    { status: 'denied'; reason: 'evidence-not-verified' } |
    { status: 'recorded'; classification: 'observation-not-fact' }>
}
export declare function createMemoryContinuity<Row extends { path: string; text: string }, Note extends { source: string; text: string }>(
  adapters: {
    recall(query: string, options: { limit: number; maxChars: number }): Promise<Row[]> | Row[]
    verifyEvidence(input: { source: string; context: unknown }): Promise<boolean> | boolean
    append(note: Note): Promise<unknown> | unknown
  }
): ContinuityMemory<Row, Note>
