import { pathToFileURL } from 'node:url'
import { createApplication } from './http/app.js'
import { createAddonInterface } from './addon.js'
import { loadConfig } from './config.js'
import { connectDatabase, disconnectDatabase, isDatabaseReady } from './database.js'
import { createLogger, toLogError } from './logger.js'
import { manifest } from './manifest.js'
import { AuditEvent } from './models/audit-event.js'
import { Meta } from './models/meta.js'
import { Stream } from './models/stream.js'
import { AuditEventRepository } from './repositories/audit-event-repository.js'
import { MetaRepository } from './repositories/meta-repository.js'
import { StreamRepository } from './repositories/stream-repository.js'
import { AdminAuditService } from './services/admin-audit-service.js'
import { MovieIngestionService } from './services/movie-ingestion-service.js'
import { MovieModerationService } from './services/movie-moderation-service.js'

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port)
    server.once('listening', () => resolve(server))
    server.once('error', reject)
  })
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

export async function startServer(environment = process.env) {
  const config = loadConfig(environment)
  const logger = createLogger({
    level: config.logLevel,
    nodeEnv: config.nodeEnv
  })

  await connectDatabase({
    uri: config.mongodbUri,
    maxAttempts: config.dbConnectMaxAttempts,
    retryDelayMs: config.dbConnectRetryMs,
    serverSelectionTimeoutMs: config.dbServerSelectionTimeoutMs,
    logger
  })

  await Promise.all([AuditEvent.createIndexes(), Meta.createIndexes(), Stream.createIndexes()])

  const auditEventRepository = new AuditEventRepository()
  const metaRepository = new MetaRepository()
  const streamRepository = new StreamRepository()
  const ingestionService = new MovieIngestionService({ metaRepository, streamRepository })
  const moderationService = new MovieModerationService({ metaRepository, streamRepository })
  const auditService = new AdminAuditService({ repository: auditEventRepository, logger })
  const addonInterface = createAddonInterface({
    manifest,
    metaRepository,
    streamRepository,
    logger
  })
  const app = createApplication({
    addonInterface,
    config,
    auditService,
    ingestionService,
    moderationService,
    isReady: isDatabaseReady,
    logger
  })

  const server = await listen(app, config.port)
  logger.info(
    {
      port: config.port,
      manifestPath: '/manifest.json',
      adminIngestionEnabled: Boolean(config.ingestApiKey)
    },
    'Servidor iniciado'
  )

  let shuttingDown = false
  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'Encerrando servidor')

    try {
      await closeServer(server)
      await disconnectDatabase()
      logger.info('Servidor encerrado com segurança')
    } catch (error) {
      logger.error({ error: toLogError(error) }, 'Falha durante o encerramento')
      process.exitCode = 1
    }
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))

  return { app, server, shutdown }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  startServer().catch((error) => {
    const logger = createLogger({ level: process.env.LOG_LEVEL, nodeEnv: process.env.NODE_ENV })
    logger.fatal({ error: toLogError(error) }, 'Não foi possível iniciar o servidor')
    process.exitCode = 1
  })
}
