import { screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { PublicApplicationForm } from "@/types/api";
import { PublicApplyPage } from "./PublicApplyPage";

const SLUG = "k3J9xQ2mP0aB";
/** Storage key of the removed HR login; a stale token must never reach applicant requests. */
const TOKEN_STORAGE_KEY = "xorca.auth.token";

const publicForm: PublicApplicationForm = {
  slug: SLUG,
  title: "Apply: Data Scientist",
  intro: "Thanks for your interest! The form takes about 5 minutes.",
  company_name: "Acme Analytics",
  job: {
    title: "Data Scientist",
    department: "Data",
    location: "Jakarta",
    description: "Build and ship machine learning models.",
    required_skills: ["Python", "SQL"],
    preferred_skills: ["Airflow"],
    min_experience_years: 2,
    opens_on: null,
    closes_on: "2026-11-30",
    employment_type: "full_time",
    salary_min: null,
    salary_max: null,
  },
  built_in_fields: [
    { id: "full_name", label: "Full name", type: "short_text", required: true, built_in: true },
    { id: "email", label: "Email", type: "email", required: true, built_in: true },
    { id: "phone", label: "Phone number", type: "phone", required: true, built_in: true },
    { id: "cv", label: "CV (PDF or DOCX, max 10 MB)", type: "file", required: true, built_in: true },
  ],
  fields: [
    {
      id: "f_notice",
      label: "When can you start?",
      type: "select",
      required: true,
      help_text: null,
      placeholder: null,
      options: ["Immediately", "Within 1 month"],
      max_length: null,
    },
    {
      id: "f_portfolio",
      label: "Portfolio",
      type: "url",
      required: false,
      help_text: "GitHub or personal site",
      placeholder: null,
      options: [],
      max_length: null,
    },
    {
      id: "f_relocate",
      label: "Willing to relocate?",
      type: "yes_no",
      required: false,
      help_text: null,
      placeholder: null,
      options: [],
      max_length: null,
    },
  ],
  accepting_applications: true,
  closed_reason: null,
  closes_at: null,
  max_upload_mb: 10,
  privacy_notice: "Acme Analytics will process the information and CV you submit to assess your application.",
};

interface XhrResponse {
  status: number;
  body: unknown;
}

/** Minimal XMLHttpRequest stand-in: the public submit uses XHR for upload progress. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static respond: (xhr: FakeXhr) => XhrResponse = () => ({ status: 201, body: {} });

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  responseText = "";
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  abort() {
    this.onabort?.();
  }

  send(body: FormData) {
    this.body = body;
    FakeXhr.instances.push(this);
    setTimeout(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      const response = FakeXhr.respond(this);
      this.status = response.status;
      this.responseText = JSON.stringify(response.body);
      this.onload?.();
    }, 0);
  }
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/apply/:slug" element={<PublicApplyPage />} />
    </Routes>,
    { route: `/apply/${SLUG}` },
  );
}

async function fillValidApplication(user: UserEvent, container: HTMLElement) {
  await user.type(await screen.findByLabelText(/full name/i), "Ayu Lestari");
  await user.type(screen.getByLabelText(/^email/i), "ayu@example.com");
  await user.type(screen.getByLabelText(/phone number/i), "+62 812 3456 7890");
  await user.selectOptions(screen.getByLabelText(/when can you start/i), "Immediately");
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!fileInput) throw new Error("CV input not found");
  await user.upload(fileInput, new File(["%PDF-1.4 cv"], "ayu-cv.pdf", { type: "application/pdf" }));
  await user.click(screen.getByRole("checkbox", { name: /i have read the privacy notice/i }));
}

describe("PublicApplyPage", () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    // A token left in the same browser must never leak into applicant requests.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, "hr-secret-token");
  });

  afterEach(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  });

  it("renders the job and the form's fields by type", async () => {
    mockFetch(() => jsonResponse(publicForm));

    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Data Scientist" })).toBeInTheDocument();
    expect(screen.getByText("Acme Analytics is hiring")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    expect(screen.queryByText(/\/ month/)).not.toBeInTheDocument(); // salary not shared
    expect(screen.getByText(publicForm.intro as string)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText(/portfolio/i)).toHaveAttribute("type", "url");
    expect(screen.getByRole("combobox", { name: /when can you start/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByText(/will process the information and CV/)).toBeInTheDocument();

    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("autocomplete", "off");
  });

  it("shows the salary range only when HR shared it", async () => {
    mockFetch(() =>
      jsonResponse({
        ...publicForm,
        job: { ...publicForm.job, employment_type: "contract", salary_min: 12000000, salary_max: 18000000 },
      }),
    );

    renderPage();

    expect(await screen.findByText("Rp 12.000.000 – Rp 18.000.000 / month")).toBeInTheDocument();
    expect(screen.getByText("Contract")).toBeInTheDocument();
  });

  it("still renders responses without employment type or salary (older backend)", async () => {
    const { employment_type: _type, salary_min: _min, salary_max: _max, ...olderJob } = publicForm.job;
    mockFetch(() => jsonResponse({ ...publicForm, job: olderJob }));

    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Data Scientist" })).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    expect(screen.queryByText(/\/ month/)).not.toBeInTheDocument();
  });

  it("blocks submitting without a CV, consent and required answers", async () => {
    mockFetch(() => jsonResponse(publicForm));
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: /submit application/i }));

    expect(await screen.findByText("Please upload your CV.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm that you agree to the privacy notice.")).toBeInTheDocument();
    expect(screen.getAllByText("This field is required.")).toHaveLength(4); // name, email, phone, start date
    expect(screen.getByLabelText(/full name/i)).toHaveFocus();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("maps server field errors onto the fields and never sends the HR token", async () => {
    const fetchMock = mockFetch(() => jsonResponse(publicForm));
    FakeXhr.respond = () => ({
      status: 400,
      body: {
        error: {
          code: "validation_error",
          message: "Please correct the highlighted fields.",
          details: { fields: { email: "This email domain isn't accepted.", cv: "The file could not be read." } },
        },
      },
    });
    const user = userEvent.setup();

    const { container } = renderPage();
    await fillValidApplication(user, container);
    await user.click(screen.getByRole("button", { name: /submit application/i }));

    expect(await screen.findByText("This email domain isn't accepted.")).toBeInTheDocument();
    expect(screen.getByText("The file could not be read.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute("aria-invalid", "true");

    expect(FakeXhr.instances).toHaveLength(1);
    const xhr = FakeXhr.instances[0] as FakeXhr;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toMatch(new RegExp(`/public/forms/${SLUG}/submit$`));
    expect(xhr.headers.Authorization).toBeUndefined();
    for (const [, init] of fetchMock.mock.calls) {
      expect(headersOf(init).Authorization).toBeUndefined();
    }
  });

  it("submits multipart answers once and thanks the applicant by full name", async () => {
    mockFetch(() => jsonResponse(publicForm));
    FakeXhr.respond = () => ({
      status: 201,
      body: { reference: "APP-000123", message: "Thank you! Your application has been received." },
    });
    const user = userEvent.setup();

    const { container } = renderPage();
    await fillValidApplication(user, container);
    const submit = screen.getByRole("button", { name: /submit application/i });
    await user.click(submit);
    await user.click(submit);

    expect(await screen.findByRole("heading", { name: "Thank you, Ayu Lestari!" })).toBeInTheDocument();
    expect(screen.getByText(/has been received/i)).toBeInTheDocument();
    expect(screen.queryByText("APP-000123")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /what happens next/i })).not.toBeInTheDocument();

    expect(FakeXhr.instances).toHaveLength(1);
    const body = (FakeXhr.instances[0] as FakeXhr).body as FormData;
    expect(JSON.parse(String(body.get("answers")))).toEqual({
      full_name: "Ayu Lestari",
      email: "ayu@example.com",
      phone: "+62 812 3456 7890",
      f_notice: "Immediately",
      f_portfolio: null,
      f_relocate: null,
    });
    expect(body.get("consent")).toBe("true");
    expect(body.get("website")).toBe("");
    expect((body.get("cv") as File).name).toBe("ayu-cv.pdf");
  });

  it("shows the already-applied screen on 409", async () => {
    mockFetch(() => jsonResponse(publicForm));
    FakeXhr.respond = () => ({
      status: 409,
      body: {
        error: {
          code: "already_applied",
          message: "You have already applied for this position with this email address.",
        },
      },
    });
    const user = userEvent.setup();

    const { container } = renderPage();
    await fillValidApplication(user, container);
    await user.click(screen.getByRole("button", { name: /submit application/i }));

    expect(await screen.findByRole("heading", { name: /you've already applied/i })).toBeInTheDocument();
  });

  it("shows a closed screen when the form no longer accepts applications", async () => {
    mockFetch(() => jsonResponse({ ...publicForm, accepting_applications: false }));

    renderPage();

    expect(await screen.findByRole("heading", { name: /applications are closed/i })).toBeInTheDocument();
    expect(screen.getByText("Data Scientist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit application/i })).not.toBeInTheDocument();
  });

  it("tells applicants when applications open, or that the deadline passed", async () => {
    mockFetch(() =>
      jsonResponse({
        ...publicForm,
        accepting_applications: false,
        closed_reason: "not_yet_open",
        job: { ...publicForm.job, opens_on: "2026-12-01", closes_on: "2026-12-31" },
      }),
    );
    const { unmount } = renderPage();
    expect(await screen.findByRole("heading", { name: /applications aren't open yet/i })).toBeInTheDocument();
    expect(screen.getByText("01 Dec 2026")).toBeInTheDocument();
    unmount();

    mockFetch(() =>
      jsonResponse({
        ...publicForm,
        accepting_applications: false,
        closed_reason: "deadline_passed",
        job: { ...publicForm.job, opens_on: "2026-10-01", closes_on: "2026-10-31" },
      }),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: /deadline has passed/i })).toBeInTheDocument();
    expect(screen.getByText("31 Oct 2026")).toBeInTheDocument();
  });

  it("shows an invalid-link screen for an unknown slug", async () => {
    mockFetch(() => jsonResponse({ error: { code: "not_found", message: "Application form not found" } }, 404));

    renderPage();

    expect(await screen.findByRole("heading", { name: /this application link isn't valid/i })).toBeInTheDocument();
  });
});
