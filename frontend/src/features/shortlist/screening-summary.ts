import type { ScreeningResult } from "@/types/api";

export interface RequiredSkillsSummary {
  total: number;
  matched: number;
  missing: number;
  needsReview: number;
}

export interface ScreeningSummary {
  requiredSkills: RequiredSkillsSummary;
  /** Requirements of any category with status `needs_review`. */
  needsReview: number;
  flags: ScreeningResult["flags"];
  reviewed: boolean;
}

/** Counts shown in the screening results table, computed from the requirement results. */
export function summarizeScreening(result: Pick<ScreeningResult, "requirements" | "flags" | "reviews">): ScreeningSummary {
  const requiredSkills: RequiredSkillsSummary = { total: 0, matched: 0, missing: 0, needsReview: 0 };
  let needsReview = 0;
  for (const requirement of result.requirements) {
    if (requirement.status === "needs_review") needsReview += 1;
    if (requirement.category !== "required_skill") continue;
    requiredSkills.total += 1;
    if (requirement.status === "matched") requiredSkills.matched += 1;
    else if (requirement.status === "not_found") requiredSkills.missing += 1;
    else requiredSkills.needsReview += 1;
  }
  return { requiredSkills, needsReview, flags: result.flags, reviewed: result.reviews.length > 0 };
}
