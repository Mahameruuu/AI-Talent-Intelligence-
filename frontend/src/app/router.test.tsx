import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui";
import { createTestQueryClient, jsonResponse, mockFetch } from "@/test/utils";
import { routes } from "./routes";

function renderAt(path: string) {
  const fetchMock = mockFetch(() => jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404));
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router, fetchMock };
}

describe("router (no login)", () => {
  it("redirects /login to the dashboard", async () => {
    const { router } = renderAt("/login");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("opens HR pages directly and sends no Authorization header", async () => {
    const { router, fetchMock } = renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: /dashboard/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("authorization");
    }
  });
});
