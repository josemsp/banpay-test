import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import {
  errorSchema,
  ghibliIdParamSchema,
  ghibliListResponseSchema,
  ghibliQuerySchema,
  ghibliResourceParamSchema,
} from "../schemas/openapi";

const ghibli = new OpenAPIHono<AppEnv>();

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

async function fetchGhibli(c: any, resource: Resource, id?: string) {
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
    return c.json({ data }, 200);
  } catch {
    return c.json({ error: "The Studio Ghibli service is not available" }, 502);
  }
}

ghibli.use("*", requireAuth);

const listGhibliRoute = createRoute({
  method: "get",
  path: "/{resource}",
  tags: ["Ghibli"],
  summary: "List Ghibli resource",
  description:
    "List resources from Studio Ghibli API. Access depends on user role.",
  security: [{ bearerAuth: [] }],
  request: {
    params: ghibliResourceParamSchema,
    query: ghibliQuerySchema,
  },
  responses: {
    200: {
      description: "List of resources",
      content: {
        "application/json": {
          schema: ghibliListResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: errorSchema,
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
      description: "Resource not found",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    502: {
      description: "Studio Ghibli service unavailable",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

ghibli.openapi(listGhibliRoute, async (c: any) => {
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

const getGhibliRoute = createRoute({
  method: "get",
  path: "/{resource}/{id}",
  tags: ["Ghibli"],
  summary: "Get Ghibli resource by ID",
  description:
    "Get a single resource from Studio Ghibli API. Access depends on user role.",
  security: [{ bearerAuth: [] }],
  request: {
    params: ghibliIdParamSchema,
    query: ghibliQuerySchema,
  },
  responses: {
    200: {
      description: "Resource found",
      content: {
        "application/json": {
          schema: ghibliListResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: errorSchema,
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
      description: "Resource not found",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    502: {
      description: "Studio Ghibli service unavailable",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

ghibli.openapi(getGhibliRoute, async (c: any) => {
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
