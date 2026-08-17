import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4790),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  JWT_SECRET: z.string().min(1).default('change-me-dev-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('change-me-dev-refresh-secret'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Server cannot start with invalid environment configuration.');
}

export const env = parsed.data;
