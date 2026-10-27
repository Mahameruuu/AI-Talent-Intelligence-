import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBadge } from "./score";
import { StatusBadge } from "./status-badge";

describe("ScoreBadge", () => {
  it("rounds the score and uses the high band for strong matches", () => {
    render(<ScoreBadge score={82.6} />);
    const badge = screen.getByLabelText(/match score 83 of 100/i);
    expect(badge).toHaveTextContent("83");
    expect(badge).toHaveAttribute("data-tone", "high");
  });

  it("uses medium and low bands", () => {
    render(
      <>
        <ScoreBadge score={60} />
        <ScoreBadge score={12} />
      </>,
    );
    expect(screen.getByText("60")).toHaveAttribute("data-tone", "medium");
    expect(screen.getByText("12")).toHaveAttribute("data-tone", "low");
  });

  it("renders a neutral dash when the score is not computable", () => {
    render(<ScoreBadge score={null} />);
    const badge = screen.getByLabelText("Not scored");
    expect(badge).toHaveTextContent("—");
    expect(badge).toHaveAttribute("data-tone", "none");
  });
});

describe("StatusBadge", () => {
  it("labels requirement statuses exactly", () => {
    render(
      <>
        <StatusBadge kind="requirement" value="matched" />
        <StatusBadge kind="requirement" value="not_found" />
        <StatusBadge kind="requirement" value="needs_review" />
      </>,
    );
    expect(screen.getByText("Matched")).toBeInTheDocument();
    expect(screen.getByText("Not Found in CV")).toBeInTheDocument();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
  });

  it("renders document, stage and interview statuses with readable labels", () => {
    render(
      <>
        <StatusBadge kind="document" value="completed" />
        <StatusBadge kind="stage" value="shortlisted" />
        <StatusBadge kind="interview" value="in_progress" />
        <StatusBadge kind="evaluation" value="needs_review" />
      </>,
    );
    expect(screen.getByText("Processed").closest("[data-status]")).toHaveAttribute("data-status", "completed");
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });
});
