import { createHash, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import { toLogError } from '../logger.js'
import { ModerationConfirmationError } from '../services/movie-moderation-service.js'

const digest = (value) => createHash('sha256').update(value).digest()

export function isApiKeyValid(authorizationHeader, expectedApiKey) {
  if (!expectedApiKey || typeof authorizationHeader !== 'string') return false

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return false

  return timingSafeEqual(digest(match[1]), digest(expectedApiKey))
}

const moderatorIdFrom = (req) => req.get('x-moderator-id') || undefined

export function createAdminRouter({
  config,
  auditService,
  ingestionService,
  moderationService,
  logger
}) {
  const router = express.Router()

  router.use(rateLimit({
    windowMs: config.adminRateLimitWindowMs,
    limit: config.adminRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }))

  router.use((req, res, next) => {
    if (!config.ingestApiKey) {
      return res.status(404).json({ error: 'not_found' })
    }

    if (!isApiKeyValid(req.get('authorization'), config.ingestApiKey)) {
      res.set('WWW-Authenticate', 'Bearer realm="movie-ingestion"')
      return res.status(401).json({ error: 'unauthorized' })
    }

    return next()
  })

  router.use(express.json({
    limit: '256kb',
    type: ['application/json', 'application/*+json']
  }))

  router.post('/movies', async (req, res, next) => {
    try {
      const { result, event } = await auditService.execute({
        action: 'movie.ingested',
        metaId: req.body?.meta?.id,
        moderatorId: moderatorIdFrom(req),
        requestId: req.requestId,
        operation: () => ingestionService.upsert(req.body),
        summarize: ({ receivedStreams, matchedCount, modifiedCount, upsertedCount }) => ({
          receivedStreams,
          matchedCount,
          modifiedCount,
          upsertedCount
        })
      })
      logger.info({
        requestId: req.requestId,
        metaId: result.metaId,
        moderatorId: moderatorIdFrom(req),
        receivedStreams: result.receivedStreams
      }, 'Filme importado')
      return res.status(200).json({ data: result, audit: event })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/movies/:metaId', async (req, res, next) => {
    try {
      const result = await moderationService.get(req.params.metaId)
      if (!result) return res.status(404).json({ error: 'movie_not_found' })
      return res.json({ data: result })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/movies/:metaId/audit', async (req, res, next) => {
    try {
      const events = await auditService.history(req.params.metaId, {
        limit: req.query.limit
      })
      return res.json({ data: events })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/movies/:metaId/disable', async (req, res, next) => {
    try {
      const { result, event } = await auditService.execute({
        action: 'movie.disabled',
        metaId: req.params.metaId,
        moderatorId: moderatorIdFrom(req),
        requestId: req.requestId,
        operation: () => moderationService.disable(
          req.params.metaId,
          req.get('x-confirm-movie-id')
        )
      })
      if (!result) return res.status(404).json({ error: 'movie_not_found' })

      logger.info({
        requestId: req.requestId,
        metaId: result.meta.id,
        moderatorId: moderatorIdFrom(req)
      }, 'Filme desativado pela moderação')
      return res.json({ data: result, audit: event })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/movies/:metaId/restore', async (req, res, next) => {
    try {
      const { result, event } = await auditService.execute({
        action: 'movie.restored',
        metaId: req.params.metaId,
        moderatorId: moderatorIdFrom(req),
        requestId: req.requestId,
        operation: () => moderationService.restore(req.params.metaId)
      })
      if (!result) return res.status(404).json({ error: 'movie_not_found' })

      logger.info({
        requestId: req.requestId,
        metaId: result.meta.id,
        moderatorId: moderatorIdFrom(req)
      }, 'Filme restaurado pela moderação')
      return res.json({ data: result, audit: event })
    } catch (error) {
      return next(error)
    }
  })

  router.use((error, req, res, _next) => {
    if (error instanceof ModerationConfirmationError) {
      return res.status(400).json({
        error: 'confirmation_required',
        message: error.message
      })
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'invalid_payload',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      })
    }

    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large' })
    }

    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'invalid_json' })
    }

    logger.error({ requestId: req.requestId, error: toLogError(error) }, 'Falha na API administrativa')
    return res.status(500).json({ error: 'internal_error' })
  })

  return router
}
