import { Hono, type Context } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const ghibli = new Hono<AppEnv>();

const resources = {
  films: "films",
  people: "people",
  locations: "locations",
  species: "species",
  vehicles: "vehicles",
} as const;

type Resource = keyof typeof resources;

const roleToResource: Record<string, Resource | "all"> = {
  admin: "all",
  films: "films",
  people: "people",
  locations: "locations",
  species: "species",
  vehicles: "vehicles",
};

function isResource(value: string): value is Resource {
  return Object.prototype.hasOwnProperty.call(resources, value);
}

function canAccess(role: string, resource: Resource): boolean {
  const allowed = roleToResource[role];
  return allowed === "all" || allowed === resource;
}

async function fetchGhibli(
  c: Context<AppEnv>,
  resource: Resource,
  id?: string,
) {
  const path = `https://ghibliapi.vercel.app/${resources[resource]}${
    id ? `/${encodeURIComponent(id)}` : ""
  }`;

  const params = new URLSearchParams();
  const fields = c.req.query("fields");
  const limit = c.req.query("limit");

  if (fields !== undefined) {
    if (!/^[a-zA-Z_,]+$/.test(fields)) {
      return c.json({ error: "The 'fields' parameter is invalid" }, 400);
    }

    params.set("fields", fields);
  }

  if (limit !== undefined) {
    const parsedLimit = Number(limit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 250
    ) {
      return c.json(
        { error: "The 'limit' parameter must be an integer between 1 and 250" },
        400,
      );
    }

    params.set("limit", String(parsedLimit));
  }

  const query = params.toString();
  const requestUrl = query ? `${path}?${query}` : path;

  try {
    const response = await fetch(requestUrl, {
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      return c.json({ error: "Resource not found" }, 404);
    }

    if (!response.ok) {
      return c.json(
        { error: "The Studio Ghibli service is not available" },
        502,
      );
    }

    const data: unknown = await response.json();
    return c.json({ data });
  } catch {
    return c.json({ error: "The Studio Ghibli service is not available" }, 502);
  }
}

ghibli.use("*", requireAuth);

ghibli.get("/:resource", async (c) => {
  const resourceParam = c.req.param("resource");

  if (!isResource(resourceParam)) {
    return c.json({ error: "Resource not found" }, 404);
  }

  const role = c.get("authUser").role;

  if (!canAccess(role, resourceParam)) {
    return c.json(
      { error: "You do not have permission to access this resource" },
      403,
    );
  }

  return fetchGhibli(c, resourceParam);
});

ghibli.get("/:resource/:id", async (c) => {
  const resourceParam = c.req.param("resource");
  const id = c.req.param("id");

  if (!isResource(resourceParam)) {
    return c.json({ error: "Resource not found" }, 404);
  }

  if (!id.trim() || id.length > 100) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const role = c.get("authUser").role;

  if (!canAccess(role, resourceParam)) {
    return c.json(
      { error: "You do not have permission to access this resource" },
      403,
    );
  }

  return fetchGhibli(c, resourceParam, id);
});

export default ghibli;
