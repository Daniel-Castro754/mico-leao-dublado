import { z } from 'zod'
import { toLogError } from '../logger.js'
import { imdbIdSchema } from '../schemas/movie.js'

const moderatorIdSchema = z.string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}._@-]+$/u, 'X-Moderator-Id contém caracteres inválidos')
  .optional()

const executionSchema = z.object({
  action: z.enum(['movie.ingested', 'movie.disabled', 'movie.restored']),
  metaId: imdbIdSchema,
  moderatorId: moderatorIdSchema,
  requestId: z.uuid()
})

const historyOptionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
})

function auditError(error) {
  const safeError = toLogError(error)
  return {
    name: safeError.name ?? 'Error',
    ...(safeError.code !== undefined && { code: String(safeError.code) })
  }
}

export class AdminAuditService {
  constructor({ repository, logger }) {
    this.repository = repository
    this.logger = logger
  }

  async execute({ action, metaId, moderatorId, requestId, operation, summarize }) {
    const eventInput = executionSchema.parse({ action, metaId, moderatorId, requestId })
    const startedEvent = await this.repository.start(eventInput)

    let result
    try {
      result = await operation()
    } catch (error) {
      try {
        await this.repository.finish(startedEvent.id, {
          status: 'failed',
          error: auditError(error)
        })
      } catch (auditErrorValue) {
        this.logger.error(
          {
            requestId,
            metaId,
            error: toLogError(auditErrorValue)
          },
          'Falha ao finalizar evento de auditoria'
        )
      }
      throw error
    }

    const status = result === null ? 'not_found' : 'completed'
    const details = result === null ? undefined : summarize?.(result)
    const event = await this.repository.finish(startedEvent.id, { status, details })
    return { result, event }
  }

  async history(metaId, options = {}) {
    const id = imdbIdSchema.parse(metaId)
    const parsedOptions = historyOptionsSchema.parse(options)
    return this.repository.findByMetaId(id, parsedOptions)
  }
}
