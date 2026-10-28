import { vi } from "vitest";
import { db } from "./db";

// Registered before the routes below are imported, so every route gets the
// in-memory fake instead of a real Supabase client.
vi.mock("../../src/lib/supabase", () => ({
  createSupabaseClient: () => db,
  createSupabaseAdminClient: () => db,
}));

import { Hono } from "hono";
import auth from "../../src/routes/auth";
import users from "../../src/routes/users";
import type { AppEnv } from "../../src/types";
import ghibli from "../../src/routes/ghibli";

export const env: AppEnv["Bindings"] = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};

export const AUTH_HEADERS = { Authorization: "Bearer test-access-token" };

export function createTestApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/v1/auth", auth);
  app.route("/api/v1/users", users);
  app.route("/api/v1/ghibli", ghibli);
  return app;
}

export function jsonBody(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}
