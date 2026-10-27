import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { DataRetentionSettings } from "@/types/api";
import { monthsError } from "./utils/retention";
import { SettingsPage } from "./SettingsPage";

const retention: DataRetentionSettings = {
  enabled: true,
  months_after_close: 12,
  keep_hired: true,
  is_default: false,
  updated_at: "2026-10-20T08:00:00Z",
  updated_by: "Ayu Admin",
  last_run_at: null,
  last_run_result: null,
  preview: { eligible_applications: 7, eligible_candidates: 5, next_run_at: "2026-10-28T02:00:00+07:00" },
};

function renderSettings(route: string, settings: DataRetentionSettings = retention) {
  const fetchMock = mockFetch((url, init) => {
    if (url.includes("/settings/data-retention/run")) {
      return jsonResponse({ trigger: "manual", months_after_close: 12, keep_hired: true, applications: 7,
        candidates: 5, documents: 7, interview_sessions: 2 });
    }
    if (url.includes("/settings/data-retention") && init?.method === "PUT") {
      return jsonResponse({ ...settings, ...JSON.parse(String(init.body)) });
    }
    if (url.includes("/settings/data-retention")) return jsonResponse(settings);
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
  renderWithProviders(<SettingsPage />, { route });
  return fetchMock;
}

describe("Settings → Data retention", () => {
  it("validates the months field", () => {
    expect(monthsError("12")).toBeNull();
    expect(monthsError("0")).not.toBeNull();
    expect(monthsError("37")).not.toBeNull();
    expect(monthsError("2.5")).not.toBeNull();
    expect(monthsError("")).not.toBeNull();
  });

  it("lets HR save the rules and run them after confirming", async () => {
    const user = userEvent.setup();
    const fetchMock = renderSettings("/settings?tab=retention");
    const months = await screen.findByLabelText("Delete data");
    await user.clear(months);
    await user.type(months, "6");
    await user.click(screen.getByRole("checkbox", { name: /keep data of hired candidates/i }));
    expect(screen.getByRole("button", { name: /run now/i })).toBeDisabled(); // unsaved changes
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({ enabled: true, months_after_close: 6, keep_hired: false });
    });

    await user.click(await screen.findByRole("button", { name: /run now/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("permanently deleted");
    await user.click(within(dialog).getByRole("button", { name: /delete now/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/run") && init?.method === "POST")).toBe(true),
    );
  });
});

describe("Settings → Security & privacy", () => {
  it("renders the key sections in Bahasa Indonesia", async () => {
    renderSettings("/settings?tab=security");
    for (const title of [
      "Akses & autentikasi",
      "Perlindungan dokumen CV",
      "Link AI interview",
      "Formulir lamaran",
      "AI yang adil & dapat dijelaskan",
      "Jejak audit",
      "Hak subjek data (UU PDP)",
      "Keamanan server",
      "Pihak ketiga (transparan)",
      "Rencana produksi",
    ]) {
      expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/ditangani oleh sistem pusat/)).toBeInTheDocument();
    expect(screen.getByText(/tidak boleh dibuka langsung ke internet publik/)).toBeInTheDocument();
    expect(screen.getByText(/Rencana produksi — belum aktif/)).toBeInTheDocument();
    const status = await screen.findByTestId("retention-status");
    expect(status).toHaveTextContent("Aktif");
    expect(status).toHaveTextContent("12 bulan setelah lowongan ditutup");
  });

  it("shows retention as inactive when it is off", async () => {
    renderSettings("/settings?tab=security", { ...retention, enabled: false, months_after_close: 24 });
    const status = await screen.findByTestId("retention-status");
    expect(status).toHaveTextContent("Nonaktif");
    expect(status).toHaveTextContent("24 bulan");
  });
});
