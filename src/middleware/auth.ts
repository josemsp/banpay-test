import { createMiddleware } from "hono/factory";
import {
  createSupabaseClient,
  createSupabaseAdminClient,
} from "../lib/supabase";
import type { AppEnv } from "../types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return c.json({ error: "Token de acceso requerido" }, 401);
  }

  const token = match[1];

  const supabase = createSupabaseClient({
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: c.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: c.env.SUPABASE_SECRET_KEY,
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return c.json({ error: "Token inválido o expirado" }, 401);
  }

  const admin = createSupabaseAdminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, deleted_at")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    return c.json({ error: "Error al verificar el perfil" }, 500);
  }

  if (!profile || profile.deleted_at !== null) {
    return c.json({ error: "Usuario inactivo o sin perfil" }, 403);
  }

  c.set("authUser", {
    id: profile.id,
    role: profile.role,
  });

  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("authUser").role !== "admin") {
    return c.json({ error: "Permisos insuficientes" }, 403);
  }

  await next();
});
