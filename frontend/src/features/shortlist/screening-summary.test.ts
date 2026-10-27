import { describe, expect, it } from "vitest";
import type { RequirementResult } from "@/types/api";
import { summarizeScreening } from "./screening-summary";

function requirement(category: RequirementResult["category"], status: RequirementResult["status"]): RequirementResult {
  return {
    key: `${category}:${status}:${Math.random()}`,
    category,
    requirement: "x",
    status,
    matched_by: null,
    candidate_value: null,
    explanation: "",
    evidence: [],
    hr_validation: null,
  };
}

describe("summarizeScreening", () => {
  it("counts required skills by status and needs-review across all categories", () => {
    const summary = summarizeScreening({
      requirements: [
        requirement("required_skill", "matched"),
        requirement("required_skill", "matched"),
        requirement("required_skill", "not_found"),
        requirement("required_skill", "needs_review"),
        requirement("preferred_skill", "needs_review"),
        requirement("experience", "matched"),
      ],
      flags: [{ code: "scanned", severity: "warning", message: "Scanned document" }],
      reviews: [],
    });
    expect(summary.requiredSkills).toEqual({ total: 4, matched: 2, missing: 1, needsReview: 1 });
    expect(summary.needsReview).toBe(2);
    expect(summary.flags).toHaveLength(1);
    expect(summary.reviewed).toBe(false);
  });
});
