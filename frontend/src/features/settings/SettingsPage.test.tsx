import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { ScoringWeightSettings, SystemStatus } from "@/types/api";
import { SettingsPage } from "./SettingsPage";

const systemStatus: SystemStatus = {
  database: "ok",
  llm: { enabled: false, provider: null, model: null, detail: "No API key configured; rule-based extraction only." },
  ocr: { available: true, detail: "Tesseract 5" },
  embeddings: { backend: "tfidf-lexical", detail: "Lexical similarity" },
  ner: { backend: "rule-based", detail: "Pattern rules" },
  skill_taxonomy: { version: "taxonomy-v1", skills: 412, aliases: 980 },
  worker: { max_workers: 2, queued: 0, running: 1 },
  recent_failures: [],
  pipeline_version: "cv-nlp-1.0.0",
};

const weightSettings: ScoringWeightSettings = {
  items: [
    { no: 1, key: "required_skills", label: "Skill wajib", description: "Skill wajib di CV", weight: 35 },
    { no: 2, key: "preferred_skills", label: "Skill tambahan", description: "Skill tambahan", weight: 15 },
    { no: 3, key: "experience", label: "Pengalaman kerja", description: "Pengalaman", weight: 20 },
    { no: 4, key: "education", label: "Pendidikan", description: "Pendidikan", weight: 10 },
    { no: 5, key: "certifications", label: "Sertifikasi", description: "Sertifikasi", weight: 5 },
    { no: 6, key: "semantic", label: "Kemiripan teks CV dengan deskripsi lowongan", description: "Kemiripan", weight: 10 },
    { no: 7, key: "screening_questions", label: "Screening questions", description: "Pertanyaan kualifikasi", weight: 5 },
  ],
  total: 100,
  is_default: true,
  updated_at: null,
  updated_by: null,
  affected_applications: 12,
};

function renderSettings(route = "/settings") {
  const fetchMock = mockFetch((url, init) => {
    if (url.includes("/settings/scoring-weights") && init?.method === "PUT") {
      return jsonResponse({ ...weightSettings, is_default: false, rescreen_queued: 12 });
    }
    if (url.includes("/settings/scoring-weights")) return jsonResponse(weightSettings);
    if (url.includes("/system/status")) return jsonResponse(systemStatus);
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
  renderWithProviders(<SettingsPage />, { route });
  return fetchMock;
}

describe("SettingsPage", () => {
  it("shows every settings tab to everyone, without profile or user management", () => {
    renderSettings();

    for (const name of [/scoring weights/i, /data retention/i, /security/i, /system status/i]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: /scoring weights/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /users/i })).not.toBeInTheDocument();
  });

  it("lets HR change only the numbers, requires a 100% total and saves", async () => {
    const user = userEvent.setup();
    const fetchMock = renderSettings("/settings?tab=weights");

    expect(await screen.findByRole("columnheader", { name: "Keterangan" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nilai Bobot (%)" })).toBeInTheDocument();
    expect(screen.getByText("Skill wajib")).toBeInTheDocument();
    expect(screen.getByLabelText("Screening questions")).toHaveValue(5);
    expect(screen.getByRole("status", { name: "Total 100%" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /simpan bobot/i });
    expect(save).toBeDisabled(); // nothing changed yet

    const required = screen.getByLabelText("Skill wajib");
    await user.clear(required);
    await user.type(required, "45");
    expect(screen.getByRole("status", { name: "Total 110%" })).toBeInTheDocument();
    expect(screen.getByText(/Lebih 10%/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    const semantic = screen.getByLabelText("Kemiripan teks CV dengan deskripsi lowongan");
    await user.clear(semantic);
    await user.type(semantic, "0");
    expect(screen.getByRole("status", { name: "Total 100%" })).toBeInTheDocument();
    await user.click(save);

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        weights: {
          required_skills: 45,
          preferred_skills: 15,
          experience: 20,
          education: 10,
          certifications: 5,
          semantic: 0,
          screening_questions: 5,
        },
      });
    });
  });

  it("renders component health with labels", async () => {
    renderSettings("/settings?tab=system");

    expect(await screen.findByText("Running with reduced capabilities")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("No recent failures")).toBeInTheDocument();
  });
});
