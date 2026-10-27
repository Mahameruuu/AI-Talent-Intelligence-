import { describe, expect, it } from "vitest";
import { buildShortlistRows, parseMinScore, parseTopN, selectTopApplications, selectTopN } from "./shortlist-utils";
import { makeApplication, makeScreening } from "./test-fixtures";

describe("buildShortlistRows", () => {
  it("ranks by match score, keeps unscored candidates last and counts skills/flags", () => {
    const rows = buildShortlistRows(
      [makeApplication(1), makeApplication(2), makeApplication(3), makeApplication(4, { stage: "applied" })],
      [
        makeScreening(1, 55),
        makeScreening(2, 90, { flags: [{ code: "ocr", severity: "warning", message: "OCR used" }] }),
        makeScreening(3, null, { status: "failed" }),
      ],
    );
    expect(rows.map((row) => row.applicationId)).toEqual([2, 1, 3, 4]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, null, null]);
    expect(rows[0]?.required).toEqual({ total: 2, matched: 1, missing: 1 });
    expect(rows[0]?.flags).toHaveLength(1);
    expect(rows[2]?.screeningFailed).toBe(true);
    expect(rows[3]?.screened).toBe(false);
    expect(rows[0]?.source).toBe("public_form");
  });
});

describe("selectTopN", () => {
  const rows = buildShortlistRows(
    [
      makeApplication(1, { stage: "applied" }),
      makeApplication(2, { stage: "screening" }),
      makeApplication(3, { stage: "rejected" }),
      makeApplication(4, { stage: "shortlisted" }),
      makeApplication(5, { stage: "screening" }), // not screened yet
      makeApplication(6, { stage: "screening" }),
      makeApplication(7, { stage: "screening" }),
    ],
    [
      makeScreening(1, 70),
      makeScreening(2, 85),
      makeScreening(3, 99),
      makeScreening(4, 95),
      makeScreening(6, 40),
      makeScreening(7, null, { status: "failed" }),
    ],
  );

  it("picks the highest scores among screened applied/screening candidates only", () => {
    expect(selectTopN(rows, 10)).toEqual([2, 1, 6]);
    expect(selectTopN(rows, 2)).toEqual([2, 1]);
  });

  it("ignores unscreened, failed, rejected and already shortlisted candidates", () => {
    const picked = selectTopN(rows, 10);
    expect(picked).not.toContain(3); // rejected
    expect(picked).not.toContain(4); // already shortlisted
    expect(picked).not.toContain(5); // not screened
    expect(picked).not.toContain(7); // screening failed
  });

  it("respects the optional minimum score", () => {
    expect(selectTopN(rows, 10, 70)).toEqual([2, 1]);
    expect(selectTopN(rows, 10, 90)).toEqual([]);
  });

  it("returns nothing for a non-positive N", () => {
    expect(selectTopN(rows, 0)).toEqual([]);
  });
});

describe("input parsing", () => {
  it("validates top N and min score", () => {
    expect(parseTopN("10").value).toBe(10);
    expect(parseTopN("0").error).not.toBeNull();
    expect(parseTopN("2.5").error).not.toBeNull();
    expect(parseMinScore("").value).toBeUndefined();
    expect(parseMinScore("65").value).toBe(65);
    expect(parseMinScore("120").error).not.toBeNull();
  });
});

describe("selectTopApplications", () => {
  it("picks the highest-scored applications still in applied/screening", () => {
    const summary = (score: number) => ({
      overall_score: score,
      required_matched: 0,
      required_total: 0,
      needs_review: 0,
      screening_met: 0,
      screening_total: 0,
      knockout_failed: false,
      flags: 0,
    });
    const applications = [
      makeApplication(1, { screening_summary: summary(70), stage: "applied" }),
      makeApplication(2, { screening_summary: summary(90), stage: "shortlisted" }),
      makeApplication(3, { screening_summary: summary(85) }),
      makeApplication(4, { match_score: null }),
      makeApplication(5, { screening_summary: summary(40) }),
    ];
    expect(selectTopApplications(applications, 2).map((item) => item.id)).toEqual([3, 1]);
    expect(selectTopApplications(applications, 5, 50).map((item) => item.id)).toEqual([3, 1]);
    expect(selectTopApplications(applications, 0)).toEqual([]);
  });
});
