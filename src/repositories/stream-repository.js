import { Stream } from '../models/stream.js'

const publicProjection = {
  _id: 0,
  createdAt: 0,
  updatedAt: 0
}

export class StreamRepository {
  constructor(model = Stream) {
    this.model = model
  }

  async findByMetaId(metaId) {
    return this.model.find({ metaId }, publicProjection)
      .sort({ title: 1, infoHash: 1 })
      .maxTimeMS(5_000)
      .lean()
      .exec()
  }

  async findAdminByMetaId(metaId) {
    return this.model.find({ metaId }, { _id: 0 })
      .sort({ title: 1, infoHash: 1 })
      .maxTimeMS(5_000)
      .lean()
      .exec()
  }

  async upsertMany(streams) {
    if (streams.length === 0) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
    }

    const operations = streams.map((stream) => ({
      updateOne: {
        filter: { metaId: stream.metaId, infoHash: stream.infoHash },
        update: { $set: stream },
        upsert: true
      }
    }))

    const result = await this.model.bulkWrite(operations, { ordered: false })
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount
    }
  }
}
