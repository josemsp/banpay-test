import { z } from "@hono/zod-openapi";

export const loginSchema = z.object({
  email: z.email().openapi({ example: "user@example.com" }),
  password: z.string().min(1).openapi({ example: "your_password" }),
});

export const loginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: z.string(),
  }),
});

export const errorSchema = z.object({
  error: z.string(),
});

export const errorWithDetailsSchema = z.object({
  error: z.string(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum([
    "admin",
    "films",
    "people",
    "locations",
    "species",
    "vehicles",
  ]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const createUserBodySchema = z.object({
  name: z.string().trim().min(1).max(100).openapi({ example: "John Doe" }),
  email: z.email().trim().max(254).openapi({ example: "john@example.com" }),
  password: z.string().min(8).max(72).openapi({ example: "password123" }),
  role: z
    .enum(["admin", "films", "people", "locations", "species", "vehicles"])
    .openapi({ example: "films" }),
});

export const updateUserBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z
      .enum(["admin", "films", "people", "locations", "species", "vehicles"])
      .optional(),
  })
  .strict();

export const usersListResponseSchema = z.object({
  data: z.array(userSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export const userResponseSchema = z.object({
  data: userSchema,
});

export const deleteUserResponseSchema = z.object({
  message: z.string(),
});

export const paginationQuerySchema = z.object({
  page: z.string().optional().openapi({ example: "1" }),
  limit: z.string().optional().openapi({ example: "20" }),
});

export const userIdParamSchema = z.object({
  id: z.uuid().openapi({ description: "User ID (UUID)" }),
});

export const createUserResponseSchema = z.object({
  data: userSchema,
});

export const createUserErrorDetailsSchema = errorWithDetailsSchema;
export const userNotFoundSchema = errorSchema;
export const invalidIdSchema = errorSchema;
export const invalidPaginationSchema = errorSchema;

export const ghibliResourceParamSchema = z.object({
  resource: z.string().openapi({
    description: "Ghibli resource",
  }),
});

export const ghibliIdParamSchema = z.object({
  resource: z.string(),
  id: z.string().min(1).max(100).openapi({ description: "Resource ID" }),
});

export const ghibliQuerySchema = z.object({
  fields: z.string().optional().openapi({
    description: "Comma separated fields to return",
    example: "id,title",
  }),
  limit: z.string().optional().openapi({
    description: "Limit (1-250)",
    example: "10",
  }),
});

export const ghibliListResponseSchema = z.object({
  data: z.array(z.any()),
});

export const ghibliItemResponseSchema = z.object({
  data: z.any(),
});
