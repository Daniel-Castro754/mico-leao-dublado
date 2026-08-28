import { imdbIdSchema } from '../schemas/movie.js'

export class ModerationConfirmationError extends Error {
  constructor(metaId) {
    super(`Confirme a desativação enviando X-Confirm-Movie-Id: ${metaId}`)
    this.name = 'ModerationConfirmationError'
    this.metaId = metaId
  }
}

function toModerationResult(meta) {
  if (!meta) return null
  return {
    status: meta.disabledAt ? 'disabled' : 'active',
    meta
  }
}

export class MovieModerationService {
  constructor({ metaRepository, streamRepository, now = () => new Date() }) {
    this.metaRepository = metaRepository
    this.streamRepository = streamRepository
    this.now = now
  }

  async get(metaId) {
    const id = imdbIdSchema.parse(metaId)
    const meta = await this.metaRepository.findAdminById(id)
    if (!meta) return null

    const streams = await this.streamRepository.findAdminByMetaId(id)
    return { ...toModerationResult(meta), streams }
  }

  async disable(metaId, confirmation) {
    const id = imdbIdSchema.parse(metaId)
    if (confirmation !== id) throw new ModerationConfirmationError(id)

    const meta = await this.metaRepository.setDisabledAt(id, this.now())
    return toModerationResult(meta)
  }

  async restore(metaId) {
    const id = imdbIdSchema.parse(metaId)
    const meta = await this.metaRepository.setDisabledAt(id, null)
    return toModerationResult(meta)
  }
}
