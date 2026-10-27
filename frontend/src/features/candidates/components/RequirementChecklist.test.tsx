import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentScore, RequirementResult } from "@/types/api";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { RequirementChecklist } from "./RequirementChecklist";

function requirement(overrides: Partial<RequirementResult> & Pick<RequirementResult, "key" | "category">): RequirementResult {
  return {
    requirement: "Python",
    status: "matched",
    matched_by: "exact",
    candidate_value: null,
    explanation: "",
    evidence: [],
    hr_validation: null,
    ...overrides,
  };
}

const requirements: RequirementResult[] = [
  requirement({ key: "required_skill:python", category: "required_skill", requirement: "Python", status: "matched" }),
  requirement({
    key: "required_skill:sql",
    category: "required_skill",
    requirement: "SQL",
    status: "not_found",
    matched_by: null,
  }),
  requirement({
    key: "screening_question:f_relocate",
    category: "screening_question",
    requirement: "Willing to relocate?",
    status: "matched",
    matched_by: "computed",
    candidate_value: "Yes",
    explanation: "Answered “Yes”; expected Yes.",
  }),
  {
    ...requirement({
      key: "screening_question:f_sponsor",
      category: "screening_question",
      requirement: "Do you need visa sponsorship?",
      status: "not_found",
      matched_by: "computed",
      candidate_value: "Yes",
      explanation: "Answered “Yes”; expected No. Must-meet qualification.",
    }),
    // Extra key sent by the backend for screening questions.
    knockout: true,
  } as RequirementResult,
];

describe("RequirementChecklist", () => {
  it("groups screening questions under their own section with Met / Not met", () => {
    render(<RequirementChecklist requirements={requirements} pending={{}} onValidate={vi.fn()} />);

    const skills = screen.getByRole("region", { name: "Required skills" });
    expect(within(skills).getByText("Matched")).toBeInTheDocument();
    expect(within(skills).getByText("Not Found in CV")).toBeInTheDocument();
    expect(within(skills).queryByText("Met")).not.toBeInTheDocument();

    const screening = screen.getByRole("region", { name: "Screening questions" });
    expect(within(screening).getByText(/Screening questions/)).toBeInTheDocument();
    expect(within(screening).getByText("Met")).toBeInTheDocument();
    expect(within(screening).getByText("Not met")).toBeInTheDocument();
    expect(within(screening).queryByText("Not Found in CV")).not.toBeInTheDocument();
    expect(within(screening).getByText("Knockout")).toBeInTheDocument();
    expect(within(screening).getAllByText("Answer:", { exact: false })).toHaveLength(2);
    expect(within(screening).queryByText("Computed")).not.toBeInTheDocument();
  });
});

describe("ScoreBreakdown", () => {
  it("labels the screening questions component", () => {
    const components: ComponentScore[] = [
      { component: "required_skills", score: 50, weight: 35, effective_weight: 70, explanation: "1 of 2 found." },
      {
        component: "screening_questions",
        score: 50,
        weight: 15,
        effective_weight: 30,
        explanation: "1 of 2 screening questions answered as expected.",
      },
    ];
    render(<ScoreBreakdown components={components} />);

    expect(screen.getByText("Screening questions")).toBeInTheDocument();
    expect(screen.queryByText("screening_questions")).not.toBeInTheDocument();
  });
});
