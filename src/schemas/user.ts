import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().max(254),
  password: z.string().min(8).max(72),
  role: z.enum([
    'admin',
    'films',
    'people',
    'locations',
    'species',
    'vehicles',
  ]),
});
