import { describe, expect, it } from "vitest";
import type { FormField, FormFieldType } from "@/types/api";
import { buildAnswersSchema, initialAnswers, REQUIRED_MESSAGE, validateAnswer, validateAnswers } from "./answer-schema";

function field(type: FormFieldType, overrides: Partial<FormField> = {}): FormField {
  return {
    id: `f_${type}`,
    label: type,
    type,
    required: false,
    help_text: null,
    placeholder: null,
    options: [],
    max_length: null,
    ...overrides,
  };
}

describe("validateAnswer", () => {
  it("requires required fields and accepts empty optional ones", () => {
    expect(validateAnswer(field("short_text", { required: true }), "  ")).toBe(REQUIRED_MESSAGE);
    expect(validateAnswer(field("short_text"), "")).toBeNull();
    expect(validateAnswer(field("multi_select", { required: true, options: ["A", "B"] }), [])).toBe(REQUIRED_MESSAGE);
    // An unticked required checkbox counts as unanswered, like on the server.
    expect(validateAnswer(field("checkbox", { required: true }), false)).toBe(REQUIRED_MESSAGE);
    expect(validateAnswer(field("checkbox"), false)).toBeNull();
  });

  it("enforces text length limits (custom and default)", () => {
    expect(validateAnswer(field("short_text", { max_length: 5 }), "abcdef")).toBe("Maximum 5 characters.");
    expect(validateAnswer(field("short_text"), "x".repeat(201))).toBe("Maximum 200 characters.");
    expect(validateAnswer(field("long_text"), "x".repeat(5000))).toBeNull();
  });

  it("validates email, phone and URL formats", () => {
    const email = field("email");
    expect(validateAnswer(email, "ayu@example.co.id")).toBeNull();
    expect(validateAnswer(email, "ayu@example")).toBe("Enter a valid email address.");

    const phone = field("phone");
    expect(validateAnswer(phone, "+62 812-3456-7890")).toBeNull();
    expect(validateAnswer(phone, "12345")).toBe("Enter a valid phone number.");
    expect(validateAnswer(phone, "+62 812 abc 7890")).toBe("Enter a valid phone number.");

    const url = field("url");
    expect(validateAnswer(url, "https://linkedin.com/in/ayu")).toBeNull();
    expect(validateAnswer(url, "linkedin.com/in/ayu")).toBe("Enter a valid URL starting with http:// or https://.");
  });

  it("validates numbers and dates", () => {
    expect(validateAnswer(field("number"), "15,000,000")).toBeNull();
    expect(validateAnswer(field("number"), "about 10")).toBe("Enter a number.");
    expect(validateAnswer(field("date"), "2026-11-01")).toBeNull();
    expect(validateAnswer(field("date"), "2026-02-30")).toBe("Enter a valid date (YYYY-MM-DD).");
  });

  it("only accepts listed options for select and multi-select, and yes/no", () => {
    const select = field("select", { options: ["Immediately", "Within 1 month"] });
    expect(validateAnswer(select, "Immediately")).toBeNull();
    expect(validateAnswer(select, "Next year")).toBe("Choose one of the options.");

    const multi = field("multi_select", { options: ["Python", "SQL", "R"] });
    expect(validateAnswer(multi, ["Python", "R"])).toBeNull();
    expect(validateAnswer(multi, ["Python", "Go"])).toBe("Choose from the listed options.");

    expect(validateAnswer(field("yes_no"), "yes")).toBeNull();
    expect(validateAnswer(field("yes_no"), "maybe")).toBe("Answer yes or no.");
  });
});

describe("buildAnswersSchema / validateAnswers", () => {
  const fields: FormField[] = [
    field("short_text", { id: "full_name", required: true }),
    field("email", { id: "email", required: true }),
    field("number", { id: "salary" }),
    field("multi_select", { id: "skills", options: ["Python", "SQL"], required: true }),
    field("yes_no", { id: "relocate" }),
    field("checkbox", { id: "agree" }),
  ];

  it("returns errors keyed by field id", () => {
    const values = { ...initialAnswers(fields), email: "not-an-email" };
    const result = validateAnswers(fields, values);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors).toEqual({
      full_name: REQUIRED_MESSAGE,
      email: "Enter a valid email address.",
      skills: REQUIRED_MESSAGE,
    });
  });

  it("cleans valid answers into API values", () => {
    const parsed = buildAnswersSchema(fields).parse({
      full_name: "  Ayu Lestari ",
      email: "Ayu@Example.com",
      salary: "15,000,000",
      skills: ["SQL", "SQL", "Python"],
      relocate: "",
      agree: true,
    });
    expect(parsed).toEqual({
      full_name: "Ayu Lestari",
      email: "ayu@example.com",
      salary: 15000000,
      skills: ["SQL", "Python"],
      relocate: null,
      agree: true,
    });
  });
});
