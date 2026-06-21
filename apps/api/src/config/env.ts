import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().length(64),

  MAX_GLOBAL_CONCURRENT_AGENTS: z.coerce.number().default(10),
  DEFAULT_MAX_AGENTS_PER_PROJECT: z.coerce.number().default(3),
  LOW_CREDIT_THRESHOLD_USD: z.coerce.number().default(5.0),
  CREDIT_POLL_INTERVAL_SECONDS: z.coerce.number().default(60),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof schema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:');
      for (const error of result.error.errors) {
        console.error(`  ${error.path.join('.')}: ${error.message}`);
      }
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}
