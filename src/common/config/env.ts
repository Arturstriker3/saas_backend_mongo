import { Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  APP_NAME: z.string().default('Plataform'),
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3000'),
  CORS_ALLOWED_ORIGINS: z.string().default('*'),
  SKIP_DB_CONNECT: z.string().default('false'),
  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().default('saas_backend'),
  MONGO_MAX_POOL_SIZE: z.string().default('100'),
  MONGO_MIN_POOL_SIZE: z.string().default('10'),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: z.string().default('5000'),
  MONGO_SOCKET_TIMEOUT_MS: z.string().default('45000'),
  MONGO_CONNECT_TIMEOUT_MS: z.string().default('10000'),
  MONGO_MAX_IDLE_TIME_MS: z.string().default('30000'),
  JWT_SECRET: z.string().default('changeme'),
  JWT_EXPIRES_IN: z.string().default('900s'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default('http://localhost:3000/auth/google/callback'),
  GOOGLE_OAUTH_STATE_TTL: z.string().default('600s'),
  REFRESH_TOKEN_TTL: z.string().default('1209600'),
  PASSWORD_RESET_TTL: z.string().default('1800'),
  RATE_LIMIT_GLOBAL_TTL: z.string().default('60'),
  RATE_LIMIT_GLOBAL_LIMIT: z.string().default('50'),
  RATE_LIMIT_RESET_TTL: z.string().default('60'),
  RATE_LIMIT_RESET_LIMIT: z.string().default('1'),
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default('onboarding@resend.dev'),
  EMAIL_WELCOME_ENABLED: z.string().default('true'),
  EMAIL_ORDER_CONFIRMATION_ENABLED: z.string().default('true'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().default('domain.events'),
  METRICS_ENABLED: z.string().default('true'),
  METRICS_ROUTE: z.string().default('/metrics'),
  RUN_SEED_ON_STARTUP: z.string().default('false'),
  DOCS_ENABLED: z.string().default('true'),
  DOCS_VERSION: z.string().default('1.0'),
  SUPER_ADMIN_EMAIL: z.string().default('admin@example.com'),
  SUPER_ADMIN_NAME: z.string().default('Super Admin'),
  SUPER_ADMIN_PASSWORD: z.string().default('admin123'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;
const logger = new Logger('Env');

function logDefaultEnvWarnings(parsed: AppEnv): void {
  const envKeys = Object.keys(parsed) as Array<keyof AppEnv>;
  for (const key of envKeys) {
    if (process.env[key] !== undefined) continue;
    logger.warn(`${String(key)} not set. Using default from EnvSchema.`);
  }
}

export function loadEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.parse(process.env);
  logDefaultEnvWarnings(parsed);
  cachedEnv = parsed;
  return parsed;
}
