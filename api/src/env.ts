import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MAX_FOLDER_DEPTH: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Directory of the built frontend to serve (single-image deployment).
  PUBLIC_DIR: z.string().default("./public"),
});

export type Env = z.infer<typeof envSchema>;

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error(
    "Invalid environment variables:",
    JSON.stringify(result.error.flatten().fieldErrors, null, 2)
  );
  process.exit(1);
}

export const env = result.data;
