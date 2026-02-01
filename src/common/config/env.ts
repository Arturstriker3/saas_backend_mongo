import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  APP_NAME: z.string().default('Plataform'),
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3000'),
  SKIP_DB_CONNECT: z.string().default('false'),
  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().default('saas_backend'),
  JWT_SECRET: z.string().default('changeme'),
  JWT_EXPIRES_IN: z.string().default('900s'),
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
  DOCS_ROUTE: z.string().default('/docs'),
  DOCS_TITLE: z.string().default('SaaS Backend API'),
  DOCS_VERSION: z.string().default('1.0'),
  SUPER_ADMIN_EMAIL: z.string().default('admin@example.com'),
  SUPER_ADMIN_NAME: z.string().default('Super Admin'),
  SUPER_ADMIN_PASSWORD: z.string().default('admin123'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.parse(process.env);
  cachedEnv = parsed;
  return parsed;
}
