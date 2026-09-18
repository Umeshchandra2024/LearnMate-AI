import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("asc_token"),

  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  // Smaller/faster Groq model for lower-stakes calls (quiz generation + grading) where
  // latency matters more than the last bit of quality. The Tutor keeps GROQ_MODEL.
  GROQ_FAST_MODEL: z.string().default("openai/gpt-oss-20b"),

  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  EMBEDDINGS_PROVIDER: z.string().default("huggingface"),
  EMBEDDINGS_MODEL: z.string().default("BAAI/bge-small-en-v1.5"),
  EMBEDDINGS_DIMENSIONS: z.coerce.number().default(384),
  HUGGINGFACEHUB_API_TOKEN: z.string().optional().default(""),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),

  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validates process.env once and caches the result. Throws loudly on boot if misconfigured. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. Check .env against .env.example.");
  }
  cached = parsed.data;
  return cached;
}
