import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (c: any, next: any) => {
    const role = c.req.header("x-test-role");

    if (!role) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("authUser", { id: "test-user", role });
    await next();
  },
}));

import ghibliRoutes from "../src/routes/ghibli";

describe("Studio Ghibli routes", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ id: "film-1", title: "Test Film" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects requests without authentication", async () => {
    const response = await ghibliRoutes.request("/films");

    expect(response.status).toBe(401);
  });

  it("allows the films role to access films", async () => {
    const response = await ghibliRoutes.request("/films", {
      headers: { "x-test-role": "films" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ id: "film-1", title: "Test Film" }],
    });
  });

  it("rejects access to a resource outside the user role", async () => {
    const response = await ghibliRoutes.request("/films", {
      headers: { "x-test-role": "people" },
    });

    expect(response.status).toBe(403);
  });

  it("allows admin to access every resource", async () => {
    const response = await ghibliRoutes.request("/vehicles", {
      headers: { "x-test-role": "admin" },
    });

    expect(response.status).toBe(200);
  });

  it("rejects unknown resources", async () => {
    const response = await ghibliRoutes.request("/unknown", {
      headers: { "x-test-role": "admin" },
    });

    expect(response.status).toBe(404);
  });

  it("rejects invalid limit values", async () => {
    const response = await ghibliRoutes.request("/films?limit=300", {
      headers: { "x-test-role": "films" },
    });

    expect(response.status).toBe(400);
  });
});
