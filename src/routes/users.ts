import { Hono } from "hono";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { createSupabaseAdminClient } from "../lib/supabase";
import { createUserSchema, updateUserSchema } from "../schemas/user";
import type { AppEnv } from "../types";
import z from "zod";

const users = new Hono<AppEnv>();

// GET /api/v1/users — Lists paginated users (admin only)
users.get("/", requireAuth, requireAdmin, async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const limit = Number(c.req.query("limit") ?? "20");

  if (
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 100
  ) {
    return c.json({ error: "Invalid pagination parameters" }, 400);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createSupabaseAdminClient(c.env);

  const { data, error, count } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at, updated_at", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return c.json({ error: "Error trying to retrieve users" }, 500);
  }

  return c.json({
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
});

// GET /api/v1/users/:id — Retrieves a user by ID (admin only)
users.get("/:id", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");

  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "Invalid user ID" }, 400);
  }

  const supabase = createSupabaseAdminClient(c.env);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, created_at, updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return c.json({ error: "Error trying to retrieve user" }, 500);
  }

  if (!data) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ data });
});

// POST /api/v1/users — Creates a new user (admin only)
users.post("/", requireAuth, requireAdmin, async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "The request body must be valid JSON" }, 400);
  }

  const validation = createUserSchema.safeParse(body);

  if (!validation.success) {
    return c.json(
      {
        error: "Invalid user data",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const { name, email, password, role } = validation.data;
  const supabase = createSupabaseAdminClient(c.env);

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

  if (authError || !authData.user) {
    if (
      authError?.code === "email_exists" ||
      authError?.message.toLowerCase().includes("already registered")
    ) {
      return c.json({ error: "Email already registered" }, 409);
    }

    return c.json({ error: "Could not create account" }, 400);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: authData.user.id,
      name,
      email: authData.user.email ?? email,
      role,
    })
    .select("id, name, email, role, created_at")
    .single();

  if (profileError) {
    // Compensate: remove the Auth account so no user is left without profile.
    const { error: rollbackError } = await supabase.auth.admin.deleteUser(
      authData.user.id,
    );

    if (rollbackError) {
      // Cannot compensate automatically: return the id so an admin can
      // reconcile this account before retrying.
      return c.json(
        {
          error: "Account was created, but could not complete profile",
          userId: authData.user.id,
        },
        500,
      );
    }

    return c.json({ error: "Could not create account" }, 500);
  }

  return c.json({ data: profile }, 201);
});

// PATCH /api/v1/users/:id — Updates an existing user (admin only)
users.patch("/:id", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");

  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "Invalid user ID" }, 400);
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "The request body must be valid JSON" }, 400);
  }

  const validation = updateUserSchema.safeParse(body);

  if (!validation.success) {
    return c.json(
      {
        error: "Invalid user data",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const changes = validation.data;
  const supabase = createSupabaseAdminClient(c.env);

  const { data: existing, error: findError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (findError) {
    return c.json({ error: "Error trying to retrieve user" }, 500);
  }

  if (!existing) {
    return c.json({ error: "User not found" }, 404);
  }

  // Evita dejar el sistema sin administradores activos.
  if (existing.role === "admin" && changes.role && changes.role !== "admin") {
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .is("deleted_at", null);

    if (countError) {
      return c.json(
        { error: "Error trying to verify active administrators" },
        500,
      );
    }

    if ((count ?? 0) <= 1) {
      return c.json(
        { error: "You cannot remove the last active administrator" },
        409,
      );
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...changes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, email, role, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return c.json({ error: "Error trying to update user" }, 500);
  }

  if (!data) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ data });
});

// DELETE /api/v1/users/:id — Soft-deletes a user (admin only)
users.delete("/:id", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");

  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "Invalid user ID" }, 400);
  }

  const supabase = createSupabaseAdminClient(c.env);

  const { data: target, error: findError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (findError) {
    return c.json({ error: "Error trying to retrieve user" }, 500);
  }

  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  if (target.role === "admin") {
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .is("deleted_at", null);

    if (countError) {
      return c.json(
        { error: "Error trying to verify active administrators" },
        500,
      );
    }

    if ((count ?? 0) <= 1) {
      return c.json(
        { error: "You cannot delete the last active administrator" },
        409,
      );
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, email, role, deleted_at")
    .maybeSingle();

  if (error) {
    return c.json({ error: "Error trying to delete user" }, 500);
  }

  if (!data) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    message: "User disabled successfully",
    data,
  });
});

export default users;
