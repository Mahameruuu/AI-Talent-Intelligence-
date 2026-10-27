import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/test/utils";
import { ApiError, apiRequest, apiUpload, getErrorMessage, parseApiError } from "./api-client";
import { analyticsApi } from "./analytics-api";

describe("parseApiError", () => {
  it("reads code, message and details from the documented ApiErrorBody", () => {
    const error = parseApiError(422, {
      error: { code: "validation_error", message: "Title is required", details: { field: "title" } },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("validation_error");
    expect(error.message).toBe("Title is required");
    expect(error.details).toEqual({ field: "title" });
  });

  it("falls back to a readable message when the body is not an ApiErrorBody", () => {
    const error = parseApiError(500, "<html>Internal Server Error</html>");
    expect(error.code).toBe("http_500");
    expect(error.message).toMatch(/server ran into an error/i);
  });

  it("handles an empty body", () => {
    const error = parseApiError(404, null);
    expect(error.code).toBe("http_404");
    expect(error.message).toMatch(/not found/i);
  });
});

describe("apiRequest", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns parsed JSON and never sends an Authorization header", async () => {
    // Even a token left over from the old login must not be sent: auth is handled by the central system.
    window.localStorage.setItem("xorca.auth.token", "stale-token");
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    const result = await apiRequest<{ ok: boolean }>("/jobs", { query: { q: "data", status: undefined, page: 2 } });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/talent/jobs?q=data&page=2");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("authorization");
  });

  it("throws an ApiError with the server's code and message", async () => {
    mockFetch(() => jsonResponse({ error: { code: "duplicate", message: "Already applied" } }, 409));
    await expect(apiRequest("/applications", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "duplicate",
      message: "Already applied",
    });
  });

  it("rejects a 401 with an ApiError and no redirect or logout", async () => {
    mockFetch(() => jsonResponse({ error: { code: "invalid_token", message: "Invalid link" } }, 401));
    await expect(apiRequest("/candidate-interview")).rejects.toMatchObject({ status: 401, code: "invalid_token" });
    expect(window.location.pathname).not.toBe("/login");
  });

  it("uploads without an Authorization header", async () => {
    const setRequestHeader = vi.fn();
    class FakeXhr {
      status = 200;
      responseText = "{}";
      upload = { onprogress: null };
      onload: (() => void) | null = null;
      open = vi.fn();
      setRequestHeader = setRequestHeader;
      send = () => this.onload?.();
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    await apiUpload("/candidates/upload", new FormData());
    expect(setRequestHeader.mock.calls.map(([name]) => String(name).toLowerCase())).not.toContain("authorization");
  });

  it("maps network failures to a network_error ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const error = await apiRequest("/jobs").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).code).toBe("network_error");
    expect(getErrorMessage(error)).toMatch(/cannot reach the server/i);
  });
});

describe("runtime validation of critical responses", () => {
  it("rejects a dashboard payload missing KPIs", async () => {
    mockFetch(() => jsonResponse({ has_data: true, has_demo_data: false }));
    await expect(analyticsApi.dashboard()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("includes field-level validation details in the error message", () => {
    const error = new ApiError(400, "validation_error", "Invalid request body.", [
      { field: "description", message: "String should have at least 10 characters" },
    ]);
    expect(getErrorMessage(error)).toBe("Invalid request body. Description: String should have at least 10 characters.");
  });
});
