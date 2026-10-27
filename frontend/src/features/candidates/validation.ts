/** HR confirmation of one AI requirement finding, saved with the next HR review. */
export type ValidationDecision = "confirmed" | "rejected";
export type PendingValidations = Record<string, ValidationDecision>;
