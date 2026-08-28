import { AuditEvent } from '../models/audit-event.js'

const publicProjection = { __v: 0 }

function normalizeEvent(event) {
  if (!event) return null
  const { _id, ...fields } = event
  return { id: String(_id), ...fields }
}

export class AuditEventRepository {
  constructor(model = AuditEvent) {
    this.model = model
  }

  async start(event) {
    const document = await this.model.create({ ...event, status: 'started' })
    return normalizeEvent(document.toObject())
  }

  async finish(id, update) {
    const event = await this.model.findByIdAndUpdate(
      id,
      {
        $set: {
          ...update,
          completedAt: new Date()
        }
      },
      { returnDocument: 'after', runValidators: true }
    ).select(publicProjection).lean().exec()
    return normalizeEvent(event)
  }

  async findByMetaId(metaId, { limit = 50 } = {}) {
    const events = await this.model.find({ metaId }, publicProjection)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .maxTimeMS(5_000)
      .lean()
      .exec()
    return events.map(normalizeEvent)
  }
}
