import { z } from 'zod'

const emptyStringToUndefined = (value) => value === '' ? undefined : value

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return value
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  return value
}, z.boolean())

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string()
    .min(1, 'MONGODB_URI é obrigatória')
    .regex(/^mongodb(?:\+srv)?:\/\//, 'MONGODB_URI deve começar com mongodb:// ou mongodb+srv://'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanFromEnvironment.default(false),
  INGEST_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(32, 'INGEST_API_KEY deve ter pelo menos 32 caracteres').optional()
  ),
  DB_CONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  DB_CONNECT_RETRY_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
  DB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  ADMIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(30)
})

export function loadConfig(environment = process.env) {
  const result = environmentSchema.safeParse(environment)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuração inválida: ${details}`)
  }

  return Object.freeze({
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    mongodbUri: result.data.MONGODB_URI,
    logLevel: result.data.LOG_LEVEL,
    trustProxy: result.data.TRUST_PROXY,
    ingestApiKey: result.data.INGEST_API_KEY,
    dbConnectMaxAttempts: result.data.DB_CONNECT_MAX_ATTEMPTS,
    dbConnectRetryMs: result.data.DB_CONNECT_RETRY_MS,
    dbServerSelectionTimeoutMs: result.data.DB_SERVER_SELECTION_TIMEOUT_MS,
    adminRateLimitWindowMs: result.data.ADMIN_RATE_LIMIT_WINDOW_MS,
    adminRateLimitMax: result.data.ADMIN_RATE_LIMIT_MAX
  })
}
