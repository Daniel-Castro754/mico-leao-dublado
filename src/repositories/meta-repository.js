import { Meta } from '../models/meta.js'

const publicProjection = {
  _id: 0,
  catalogs: 0,
  createdAt: 0,
  disabledAt: 0,
  updatedAt: 0
}

const adminProjection = { _id: 0 }

const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class MetaRepository {
  constructor(model = Meta) {
    this.model = model
  }

  async findByCatalog({ catalogId, genre, search, skip = 0, limit = 100 }) {
    const filter = { catalogs: catalogId, disabledAt: null }

    if (genre) {
      filter.genres = genre
    }

    if (search) {
      filter.name = {
        $regex: escapeRegularExpression(search.slice(0, 100)),
        $options: 'i'
      }
    }

    return this.model.find(filter, publicProjection)
      .sort({ name: 1, id: 1 })
      .skip(skip)
      .limit(limit)
      .maxTimeMS(5_000)
      .lean()
      .exec()
  }

  async isAvailable(id) {
    const result = await this.model.exists({ id, disabledAt: null })
      .maxTimeMS(5_000)
      .exec()
    return Boolean(result)
  }

  async findAdminById(id) {
    return this.model.findOne({ id }, adminProjection)
      .maxTimeMS(5_000)
      .lean()
      .exec()
  }

  async setDisabledAt(id, disabledAt) {
    return this.model.findOneAndUpdate(
      { id },
      { $set: { disabledAt } },
      { new: true, runValidators: true }
    ).select(adminProjection).lean().exec()
  }

  async upsert(meta) {
    return this.model.findOneAndUpdate(
      { id: meta.id },
      { $set: meta },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    ).lean().exec()
  }
}
