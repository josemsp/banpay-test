import { Hono } from "hono";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { createSupabaseAdminClient } from "../lib/supabase";
import { createUserSchema } from "../schemas/user";
import type { AppEnv } from "../types";

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

export default users;
