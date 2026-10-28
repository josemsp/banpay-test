import { describe, expect, it } from "vitest";
import { createTestApp, env } from "./helpers/app";
import { beforeEach } from "vitest";
import { AUTH_HEADERS, jsonBody } from "./helpers/app";
import { db, mockSignedInUser, query, resetDb, USER_ID } from "./helpers/db";

const app = createTestApp();

const listUsers = (search = "") =>
  app.request(`/api/v1/users${search}`, { headers: AUTH_HEADERS }, env);

const createUser = (body: unknown) =>
  app.request("/api/v1/users", jsonBody(body, AUTH_HEADERS), env);

const newUser = {
  name: "New User",
  email: "new@test.dev",
  password: "password123",
  role: "admin",
};

const storedProfile = {
  id: USER_ID,
  name: "New User",
  email: "new@test.dev",
  role: "admin",
  created_at: "2026-10-26T12:00:00Z",
};

beforeEach(() => {
  resetDb();
  mockSignedInUser("admin");
});

describe("GET /api/v1/users", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await app.request("/api/v1/users", undefined, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Access Token required",
    });
    expect(db.auth.getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is invalid", async () => {
    db.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });

    const res = await listUsers();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid or expired Token",
    });
  });

  it("returns 500 when the profile lookup fails", async () => {
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });

    const res = await listUsers();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Error trying to verify profile",
    });
  });

  it("returns 403 when the user has no profile", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await listUsers();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "User inactive or without profile",
    });
  });

  it("returns 403 when the profile is soft deleted", async () => {
    mockSignedInUser("admin", { deletedAt: "2026-01-01T00:00:00Z" });

    const res = await listUsers();

    expect(res.status).toBe(403);
  });

  it("returns 403 when the role is not admin", async () => {
    mockSignedInUser("films");

    const res = await listUsers();

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Insufficient permissions",
    });
    expect(query.range).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination", async () => {
    for (const search of ["?page=0", "?limit=101", "?page=abc", "?limit=1.5"]) {
      const res = await listUsers(search);

      expect(res.status, search).toBe(400);
    }

    expect(query.range).not.toHaveBeenCalled();
  });

  it("returns a page of users with pagination metadata", async () => {
    query.range.mockResolvedValue({
      data: [storedProfile],
      error: null,
      count: 25,
    });

    const res = await listUsers("?page=2&limit=10");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: [storedProfile],
      pagination: {
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      },
    });
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(query.range).toHaveBeenCalledWith(10, 19);
  });

  it("returns 500 when the list query fails", async () => {
    query.range.mockResolvedValue({
      data: null,
      error: { message: "boom" },
      count: null,
    });

    const res = await listUsers();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Error trying to retrieve users",
    });
  });
});

describe("POST /api/v1/users", () => {
  it("returns 400 when the body is not valid JSON", async () => {
    const res = await app.request(
      "/api/v1/users",
      { method: "POST", headers: AUTH_HEADERS, body: "{" },
      env,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "The request body must be valid JSON",
    });
  });

  it("returns 400 with the offending fields when validation fails", async () => {
    const res = await createUser({});

    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      error: string;
      details: Array<{ field: string; message: string }>;
    };

    expect(body.error).toBe("Invalid user data");
    expect(body.details.map((detail) => detail.field).sort()).toEqual([
      "email",
      "name",
      "password",
      "role",
    ]);
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown role", async () => {
    const res = await createUser({ ...newUser, role: "superadmin" });

    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      details: Array<{ field: string }>;
    };

    expect(body.details.map((detail) => detail.field)).toContain("role");
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("returns 409 when the email is already registered", async () => {
    db.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", message: "User already registered" },
    });

    const res = await createUser(newUser);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Email already registered",
    });
  });

  it("returns 400 when Supabase rejects the account", async () => {
    db.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "weak password" },
    });

    const res = await createUser(newUser);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Could not create account",
    });
    expect(query.insert).not.toHaveBeenCalled();
  });

  it("rolls back the Auth account when the profile insert fails", async () => {
    db.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: newUser.email } },
      error: null,
    });
    query.single.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const res = await createUser(newUser);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not create account",
    });
    expect(db.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("returns the user id when the rollback also fails", async () => {
    db.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: newUser.email } },
      error: null,
    });
    query.single.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });
    db.auth.admin.deleteUser.mockResolvedValue({
      data: null,
      error: { message: "rollback failed" },
    });

    const res = await createUser(newUser);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Account was created, but could not complete profile",
      userId: USER_ID,
    });
  });

  it("creates the Auth account and its profile", async () => {
    db.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: newUser.email } },
      error: null,
    });
    query.single.mockResolvedValue({ data: storedProfile, error: null });

    const res = await createUser(newUser);

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ data: storedProfile });
    expect(db.auth.admin.createUser).toHaveBeenCalledWith({
      email: newUser.email,
      password: newUser.password,
      email_confirm: true,
      user_metadata: { name: newUser.name },
    });
    expect(query.insert).toHaveBeenCalledWith({
      id: USER_ID,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    });
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});
