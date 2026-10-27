import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().max(254),
  password: z.string().min(8).max(72),
  role: z.enum([
    "admin",
    "films",
    "people",
    "locations",
    "species",
    "vehicles",
  ]),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z
      .enum(["admin", "films", "people", "locations", "species", "vehicles"])
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debes proporcionar al menos un campo para actualizar",
  });
