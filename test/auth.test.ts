import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, env, jsonBody } from "./helpers/app";
import { db, query, resetDb, USER_ID } from "./helpers/db";

const app = createTestApp();

const login = (body: unknown) =>
  app.request("/api/v1/auth/login", jsonBody(body), env);

const session = {
  access_token: "access-token",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "refresh-token",
};

const profile = {
  id: USER_ID,
  name: "Admin",
  email: "admin@test.dev",
  role: "admin",
  deleted_at: null,
};

beforeEach(() => {
  resetDb();
});

describe("POST /api/v1/auth/login", () => {
  it("returns 400 when the body is not valid JSON", async () => {
    const res = await app.request(
      "/api/v1/auth/login",
      { method: "POST", body: "{" },
      env,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "The request body must be valid JSON",
    });
  });

  it("returns 400 when email or password is missing", async () => {
    const res = await login({ email: "admin@test.dev" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Email and password are required",
    });
    expect(db.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 401 when Supabase rejects the credentials", async () => {
    db.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const res = await login({
      email: "admin@test.dev",
      password: "wrong-password",
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid credentials",
    });
  });

  it("returns 500 when the profile cannot be read", async () => {
    db.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID }, session },
      error: null,
    });
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });

    const res = await login({
      email: "admin@test.dev",
      password: "correct-password",
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Error trying to verify user profile",
    });
  });

  it("returns 403 when the user has no profile", async () => {
    db.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID }, session },
      error: null,
    });
    query.maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await login({
      email: "admin@test.dev",
      password: "correct-password",
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Your account is not enabled to use the API",
    });
  });

  it("returns 403 when the profile is soft deleted", async () => {
    db.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID }, session },
      error: null,
    });
    query.maybeSingle.mockResolvedValue({
      data: { ...profile, deleted_at: "2026-01-01T00:00:00Z" },
      error: null,
    });

    const res = await login({
      email: "admin@test.dev",
      password: "correct-password",
    });

    expect(res.status).toBe(403);
  });

  it("returns the session and profile on success", async () => {
    db.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID }, session },
      error: null,
    });
    query.maybeSingle.mockResolvedValue({ data: profile, error: null });

    const res = await login({
      email: "  admin@test.dev  ",
      password: "correct-password",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      access_token: "access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "refresh-token",
      user: {
        id: USER_ID,
        name: "Admin",
        email: "admin@test.dev",
        role: "admin",
      },
    });
    expect(db.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@test.dev",
      password: "correct-password",
    });
  });
});
