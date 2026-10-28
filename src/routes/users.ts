import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { createSupabaseAdminClient } from "../lib/supabase";
import { createUserSchema, updateUserSchema } from "../schemas/user";
import type { AppEnv } from "../types";
import {
  createUserBodySchema,
  createUserResponseSchema,
  deleteUserResponseSchema,
  errorSchema,
  errorWithDetailsSchema,
  invalidIdSchema,
  invalidPaginationSchema,
  paginationQuerySchema,
  updateUserBodySchema,
  userIdParamSchema,
  userNotFoundSchema,
  userResponseSchema,
  usersListResponseSchema,
} from "../schemas/openapi";

const users = new OpenAPIHono<AppEnv>();

users.use("*", requireAuth);
users.use("*", requireAdmin);

const listUsersRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Users"],
  summary: "List users",
  description: "Lists paginated users (admin only)",
  security: [{ bearerAuth: [] }],
  request: {
    query: paginationQuerySchema,
  },
  responses: {
    200: {
      description: "List of users",
      content: {
        "application/json": {
          schema: usersListResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid pagination parameters",
      content: {
        "application/json": {
          schema: invalidPaginationSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

users.openapi(listUsersRoute, async (c: any) => {
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

  return c.json(
    {
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    },
    200,
  );
});

const getUserRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Users"],
  summary: "Get user",
  description: "Retrieves a user by ID (admin only)",
  security: [{ bearerAuth: [] }],
  request: {
    params: userIdParamSchema,
  },
  responses: {
    200: {
      description: "User found",
      content: {
        "application/json": {
          schema: userResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid user ID",
      content: {
        "application/json": {
          schema: invalidIdSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: userNotFoundSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

users.openapi(getUserRoute, async (c: any) => {
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

  return c.json({ data }, 200);
});

const createUserRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Users"],
  summary: "Create user",
  description:
    "Creates a new user (admin only). Request body: { name, email, password, role }",
  security: [{ bearerAuth: [] }],
  responses: {
    201: {
      description: "User created",
      content: {
        "application/json": {
          schema: createUserResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid user data or could not create account",
      content: {
        "application/json": {
          schema: errorWithDetailsSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    409: {
      description: "Email already registered",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorWithDetailsSchema,
        },
      },
    },
  },
});

users.openapi(createUserRoute, async (c: any) => {
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
      authError?.message?.toLowerCase().includes("already registered")
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
      email: authData.user.email ?? email.toLowerCase(),
      role,
    })
    .select("id, name, email, role, created_at")
    .single();

  if (profileError) {
    const { error: rollbackError } = await supabase.auth.admin.deleteUser(
      authData.user.id,
    );

    if (rollbackError) {
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

const updateUserRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Users"],
  summary: "Update user",
  description: "Updates an existing user (admin only).",
  security: [{ bearerAuth: [] }],
  request: {
    params: userIdParamSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: updateUserBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "User updated",
      content: {
        "application/json": {
          schema: userResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid user ID or invalid user data",
      content: {
        "application/json": {
          schema: errorWithDetailsSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: userNotFoundSchema,
        },
      },
    },
    409: {
      description: "Cannot remove the last active administrator",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

users.openapi(updateUserRoute, async (c: any) => {
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
    .update(changes)
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

  return c.json({ data }, 200);
});

const deleteUserRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Users"],
  summary: "Delete user",
  description: "Soft-deletes profile and removes from Auth (admin only)",
  security: [{ bearerAuth: [] }],
  request: {
    params: userIdParamSchema,
  },
  responses: {
    200: {
      description: "User deleted",
      content: {
        "application/json": {
          schema: deleteUserResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid user ID",
      content: {
        "application/json": {
          schema: invalidIdSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: userNotFoundSchema,
        },
      },
    },
    409: {
      description: "Cannot delete the last active administrator",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

users.openapi(deleteUserRoute, async (c: any) => {
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

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("deleted_at", null);

  if (updateError) {
    return c.json({ error: "Error trying to delete user" }, 500);
  }

  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);

  if (authDeleteError) {
    console.log("authDeleteError", authDeleteError);
    return c.json({ error: "Error trying to delete user from Auth" }, 500);
  }

  return c.json({ message: "User deleted successfully" }, 200);
});

export default users;
