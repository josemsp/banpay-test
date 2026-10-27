import { Hono } from "hono";
import {
  createSupabaseClient,
  createSupabaseAdminClient,
} from "../lib/supabase";
import type { AppEnv } from "../types";

const auth = new Hono<AppEnv>();

auth.post("/login", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "The request body must be valid JSON" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    !("password" in body) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    !body.email.trim() ||
    !body.password
  ) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const email = body.email.trim();

  const supabase = createSupabaseClient({
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: c.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: c.env.SUPABASE_SECRET_KEY,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: body.password,
  });

  if (error || !data.user || !data.session) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const admin = createSupabaseAdminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, name, email, role, deleted_at")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    return c.json({ error: "Error trying to verify user profile" }, 500);
  }

  if (!profile || profile.deleted_at !== null) {
    return c.json({ error: "Your account is not enabled to use the API" }, 403);
  }

  return c.json({
    access_token: data.session.access_token,
    token_type: data.session.token_type,
    expires_in: data.session.expires_in,
    refresh_token: data.session.refresh_token,
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    },
  });
});

export default auth;
